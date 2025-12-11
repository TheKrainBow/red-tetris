import fs from 'fs';
import path from 'path';
import YAML from 'js-yaml';

const SHOP_PATHS = [
    path.resolve(process.cwd(), 'shop.yml'),
    path.resolve(process.cwd(), 'frontend/shop.yml'),
];

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

function readShopConfig() {
    for (const p of SHOP_PATHS) {
        try {
            if (!fs.existsSync(p)) continue;
            const raw = fs.readFileSync(p, 'utf8');
            return YAML.load(raw) || {};
        } catch (err) {
            console.error('[shop] failed to read', p, err);
        }
    }
    console.error('[shop] no shop.yml found');
    return {};
}

function geometricSum(per, growth, level) {
    const l = Math.max(0, level);
    if (l === 0) return 0;
    if (growth === 1) return per * l;
    return per * ((1 - Math.pow(growth, l)) / (1 - growth));
}

export class Shop {
    constructor(db) {
        this.db = db;
        this.config = readShopConfig();
        this.resources = this.config.game?.resources || [];
        this.shops = this.config.shops || [];
        this.trades = this.config.trades || [];
        this.crafts = this.config.crafts || [];
        this.notes = this.config.notes || {};
        this.shopById = Object.fromEntries(this.shops.map((s) => [s.id, s]));
        this.tradeById = Object.fromEntries(this.trades.map((t) => [t.id, t]));
        this.craftById = Object.fromEntries(this.crafts.map((c) => [c.id, c]));
    }

    async #getPlayerState(playerName) {
        const user = await this.db.get_user_by_player_name(playerName);
        if (!user || !user.length) return null;
        const inv = await this.db.get_inventory_by_player_name(playerName) || [];
        const inventoryMap = {};
        inv.forEach((row) => {
            inventoryMap[row.item_name] = row;
        });
        return { user: user[0], inventory: inventoryMap, inventoryList: inv };
    }

    #applyShopReduction(price, effects) {
        const reduction = effects?.shopReduction || 0;
        const factor = clamp(1 - reduction / 100, 0, 1);
        return Math.max(0, Math.round(price * factor));
    }

    #getLevel(inventory, itemId) {
        return Math.max(0, Number(inventory[itemId]?.current_count || 0));
    }

    #computePrice(item, level, effects) {
        const base = Number(item.starting_price) || 0;
        const growth = Number(item.price_growth_multiplier) || 1;
        const raw = base * Math.pow(growth, level);
        return this.#applyShopReduction(Math.round(raw), effects);
    }

    #deriveEffectsFromInventory(invMap) {
        const lineBonus = { dirt: 0, stone: 0, iron: 0, diamond: 0 };
        let fortuneMultiplierPercent = 0;
        let lineBonusMultiplier = 1;
        let shopReduction = 0;
        const spawnRateBonus = { dirt: 0, stone: 0, iron: 0, diamond: 0 };

        for (const item of this.shops) {
            const level = this.#getLevel(invMap, item.id);
            if (!level) continue;
            if (item.effect_type === 'spawn_rate_increase') {
                const total = geometricSum(Number(item.effect_per_level) || 0, Number(item.effect_growth_multiplier) || 1, level);
                const key = String(item.affects || '').trim();
                if (key && key in spawnRateBonus) spawnRateBonus[key] += total;
            } else if (item.effect_type === 'line_break_bonus') {
                const bonus = (Number(item.effect_base) || 0) * Math.pow(Number(item.effect_growth_multiplier) || 1, level - 1);
                const key = String(item.affects || '').trim();
                if (key && key in lineBonus) lineBonus[key] += bonus;
            }
        }

        for (const craft of this.crafts) {
            const count = this.#getLevel(invMap, craft.id);
            if (!count) continue;
            const effects = craft.effects || {};
            for (const [key, raw] of Object.entries(effects)) {
                if (key === 'fortune_multiplier_percent') {
                    fortuneMultiplierPercent += (Number(raw) || 0) * count;
                } else if (key === 'line_break_bonus_multiplayer') {
                    lineBonusMultiplier *= Math.max(1, Number(raw) || 1) ** count;
                } else if (key === 'shop_reduction') {
                    shopReduction += (Number(raw) || 0) * count;
                } else if (key.endsWith('_line_break_bonus')) {
                    const res = key.replace('_line_break_bonus', '');
                    if (res in lineBonus) {
                        lineBonus[res] += (Number(raw) || 0) * count;
                    }
                }
            }
        }

        return {
            lineBonus,
            lineBonusMultiplier,
            fortuneMultiplierPercent,
            shopReduction,
            spawnRateBonus,
        };
    }

    #computeSpawnRates(baseRates, effects) {
        const bonus = effects?.spawnRateBonus || {};
        const arr = [
            (Number(baseRates.dirt_probability) || 0) + (bonus.dirt || 0) * 100,
            (Number(baseRates.stone_probability) || 0) + (bonus.stone || 0) * 100,
            (Number(baseRates.iron_probability) || 0) + (bonus.iron || 0) * 100,
            (Number(baseRates.diamond_probability) || 0) + (bonus.diamond || 0) * 100,
        ];
        const sum = arr.reduce((s, v) => s + v, 0) || 1;
        return arr.map((v) => (v / sum) * 100);
    }

    async getSpawnCaps(playerName) {
        const state = await this.#getPlayerState(playerName);
        const bonuses = this.#deriveEffectsFromInventory(state?.inventory || {});
        const spawnStart = this.config.game?.spawn_probabilities_start || {};
        const absoluteMax = {
            dirt: 1.0,
            stone: 0.5,
            iron: 0.2,
            diamond: 0.03,
        };
        const baseCaps = {
            dirt: Number(spawnStart.dirt) || 0,
            stone: Number(spawnStart.stone) || 0,
            iron: Number(spawnStart.iron) || 0,
            diamond: Number(spawnStart.diamond) || 0,
        };
        const bonus = bonuses.spawnRateBonus || {};
        const caps = {
            dirt: clamp(baseCaps.dirt + (bonus.dirt || 0), 0, absoluteMax.dirt),
            stone: clamp(baseCaps.stone + (bonus.stone || 0), 0, absoluteMax.stone),
            iron: clamp(baseCaps.iron + (bonus.iron || 0), 0, absoluteMax.iron),
            diamond: clamp(baseCaps.diamond + (bonus.diamond || 0), 0, absoluteMax.diamond),
        };
        return caps;
    }

    async getPlayerEffects(playerName, baseRatesRow) {
        const state = await this.#getPlayerState(playerName);
        if (!state) return null;
        const effects = this.#deriveEffectsFromInventory(state.inventory);
        const spawnRates = this.#computeSpawnRates(baseRatesRow || {}, effects);
        return { effects, spawnRates, state };
    }

    #hasResources(state, deltas) {
        const u = state.user;
        const resources = {
            dirt: u.dirt_owned || 0,
            stone: u.stone_owned || 0,
            iron: u.iron_owned || 0,
            diamond: u.diamond_owned || 0,
            emerald: u.emeralds || 0,
        };
        for (const [key, delta] of Object.entries(deltas)) {
            if (delta >= 0) continue;
            const have = resources[key] || 0;
            if (have + delta < 0) return false;
        }
        return true;
    }

    async buy(playerName, itemId) {
        const item = this.shopById[itemId];
        if (!item) return { success: false, reason: 'item_not_found' };
        const state = await this.#getPlayerState(playerName);
        if (!state) return { success: false, reason: 'player_not_found' };

        const effects = this.#deriveEffectsFromInventory(state.inventory);
        const level = this.#getLevel(state.inventory, itemId);
        const max = Number.isFinite(item.max_level) ? item.max_level : Infinity;
        if (level >= max) return { success: false, reason: 'max_level' };

        const price = this.#computePrice(item, level, effects);
        const costKey = String(item.resource_cost || '').trim();
        const resources = { [costKey]: -price };
        if (!this.#hasResources(state, resources)) return { success: false, reason: 'insufficient_resources' };

        const res = await this.db.update_inventory(playerName, { resources, items: { [itemId]: 1 } });
        return { success: res?.success, user: res?.user, inventory: res?.inventory, itemId, level: level + 1 };
    }

    async trade(playerName, tradeId, times = 1) {
        const trade = this.tradeById[tradeId];
        if (!trade) return { success: false, reason: 'trade_not_found' };
        const count = Math.max(1, Number(times) || 1);
        const state = await this.#getPlayerState(playerName);
        if (!state) return { success: false, reason: 'player_not_found' };

        const resources = {};
        for (const [k, v] of Object.entries(trade.cost || {})) {
            resources[String(k)] = -((Number(v) || 0) * count);
        }
        for (const [k, v] of Object.entries(trade.give || {})) {
            resources[String(k)] = (resources[String(k)] || 0) + (Number(v) || 0) * count;
        }
        if (!this.#hasResources(state, resources)) return { success: false, reason: 'insufficient_resources' };

        const res = await this.db.update_inventory(playerName, { resources });
        return { success: res?.success, user: res?.user, inventory: res?.inventory, tradeId, times: count };
    }

    async craft(playerName, craftId, times = 1) {
        const craft = this.craftById[craftId];
        if (!craft) return { success: false, reason: 'craft_not_found' };
        const count = Math.max(1, Number(times) || 1);
        const state = await this.#getPlayerState(playerName);
        if (!state) return { success: false, reason: 'player_not_found' };

        const resources = {};
        for (const [k, v] of Object.entries(craft.cost || {})) {
            resources[String(k)] = -((Number(v) || 0) * count);
        }
        const items = {};
        for (const [k, v] of Object.entries(craft.outputs || {})) {
            items[String(k)] = (Number(v) || 0) * count;
        }
        if (!this.#hasResources(state, resources)) return { success: false, reason: 'insufficient_resources' };

        const res = await this.db.update_inventory(playerName, { resources, items });
        return { success: res?.success, user: res?.user, inventory: res?.inventory, craftId, times: count };
    }
}
