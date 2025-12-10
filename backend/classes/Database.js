import dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config();

export class Database {
    constructor() {
        this.pool = new Pool({
            user: process.env.POSTGRES_USER,
            host: process.env.POSTGRES_HOST,
            database: process.env.POSTGRES_DB,
            password: process.env.POSTGRES_PASSWORD,
            port: process.env.POSTGRES_PORT,
        });
    }

    async #connect() {
        try {
            this.client = await this.pool.connect(); 
            console.log('Connected to the database');
        } catch (err) {
            console.error('Error connecting to the database:', err);
            throw err;
        }
    }

    async #create_users_table() {
        const createTableQuery = `
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                player_name VARCHAR(100) NOT NULL UNIQUE,
                dirt_collected INT NOT NULL DEFAULT 0,
                dirt_owned INT NOT NULL DEFAULT 0,
                stone_collected INT NOT NULL DEFAULT 0,
                stone_owned INT NOT NULL DEFAULT 0,
                iron_collected INT NOT NULL DEFAULT 0,
                iron_owned INT NOT NULL DEFAULT 0,
                diamond_collected INT NOT NULL DEFAULT 0,
                diamond_owned INT NOT NULL DEFAULT 0,
                emeralds INT NOT NULL DEFAULT 0,
                game_played INT NOT NULL DEFAULT 0,
                game_won INT NOT NULL DEFAULT 0,
                time_played INT NOT NULL DEFAULT 0
            );
        `;
        try {
            await this.client.query(createTableQuery);  
            console.log('Table "users" created or already exists');
        } catch (err) {
            console.error('Error creating table:', err);
        }
    }

    async #create_inventory_table() {
        const createTableQuery = `
            CREATE TABLE IF NOT EXISTS inventory (
            id SERIAL PRIMARY KEY,
            user_id INT REFERENCES users(id) ON DELETE CASCADE,
            item_name VARCHAR(100) NOT NULL,
            current_count INT NOT NULL DEFAULT 0,
            max_count INT NOT NULL,
            UNIQUE(user_id, item_name)
        );
        `;
        try {
            await this.client.query(createTableQuery);  
            console.log('Table "inventory" created or already exists');
        } catch (err) {
            console.error('Error creating table:', err);
        }
    }

    async #create_rates_table() {
        const createTableQuery = `
            CREATE TABLE IF NOT EXISTS rates (
            id SERIAL PRIMARY KEY,
            user_id INT REFERENCES users(id) ON DELETE CASCADE,
            dirt_probability INT NOT NULL DEFAULT 100,
            stone_probability INT NOT NULL DEFAULT 0,
            iron_probability INT NOT NULL DEFAULT 0,
            diamond_probability INT NOT NULL DEFAULT 0,
            UNIQUE(user_id)
        );
        `;
        try {
            await this.client.query(createTableQuery);  
            console.log('Table "rates" created or already exists');
        } catch (err) {
            console.error('Error creating table:', err);
        }
    }

    release() {
        this.client.release();
        console.log('Client released');
    }

    async init(){
        await this.#connect();
        await this.#create_users_table();
        await this.#create_inventory_table();
        await this.#create_rates_table();
    }

    async insert_user(player_name) {
        const insertQuery = `
            INSERT INTO users (player_name)
            VALUES ($1)
            ON CONFLICT (player_name) DO NOTHING
            RETURNING id, player_name, dirt_collected, dirt_owned, stone_collected, stone_owned, iron_collected, iron_owned, diamond_collected, diamond_owned, emeralds, game_played, game_won, time_played;
        `;
        try {
            const res = await this.client.query(insertQuery, [player_name]);
            console.log('User inserted:', res.rows[0]);
        } catch (err) {
            console.error('Error inserting user:', err);
            return false;
        }
        await this.insert_inventory_item_by_player_name(player_name, "rock_detector", 100);
        await this.insert_inventory_item_by_player_name(player_name, "iron_detector", 100);
        await this.insert_inventory_item_by_player_name(player_name, "diamond_detector", 100);
        
        await this.insert_inventory_item_by_player_name(player_name, "dirt_expert", 50);
        await this.insert_inventory_item_by_player_name(player_name, "stone_expert", 50);
        await this.insert_inventory_item_by_player_name(player_name, "iron_expert", 50);
        await this.insert_inventory_item_by_player_name(player_name, "diamond_expert", 50);

        await this.insert_inventory_item_by_player_name(player_name, "fortune_enchantment", 1);
        await this.insert_inventory_item_by_player_name(player_name, "dirt_battle_pass", 1);
        await this.insert_inventory_item_by_player_name(player_name, "stone_battle_pass", 1);
        await this.insert_inventory_item_by_player_name(player_name, "iron_battle_pass", 1);
        await this.insert_inventory_item_by_player_name(player_name, "diamond_battle_pass", 1);
        await this.insert_inventory_item_by_player_name(player_name, "delux_battle_pass", 1);
        await this.insert_inventory_item_by_player_name(player_name, "stone_battle_pass", 1);

        await this.insert_rates_by_player_name(player_name);

        return true;
    }

    async get_inventory_by_player_name(playerName) {
        const selectQuery = `
            SELECT i.item_name, i.current_count, i.max_count
            FROM inventory i
            JOIN users u ON u.id = i.user_id
            WHERE u.player_name = $1;
        `;
        try {
            const res = await this.client.query(selectQuery, [playerName]);
            return res.rows;
        } catch (err) {
            console.error('Error fetching inventory by player_name:', err);
            return null;
        }
    }

    async insert_inventory_item_by_player_name(playerName, itemName, maxCount) {
        const getUserIdQuery = 'SELECT id FROM users WHERE player_name = $1 LIMIT 1;';
        try {
            const userResult = await this.client.query(getUserIdQuery, [playerName]);
            if (userResult.rows.length === 0) {
                console.log(`Player ${playerName} not found.`);
                return;
            }
            const userId = userResult.rows[0].id;

            const insertQuery = `
                INSERT INTO inventory (user_id, item_name, max_count, current_count)
                VALUES ($1, $2, $3, 0)
                ON CONFLICT (user_id, item_name) DO NOTHING;
            `;
            await this.client.query(insertQuery, [userId, itemName, maxCount]);
            console.log(`Item '${itemName}' added to ${playerName}'s inventory.`);
        } catch (err) {
            console.error('Error inserting inventory item by player_name:', err);
        }
    }

    async get_user_by_player_name(player_name) {
        const selectQuery = 'SELECT * FROM users WHERE player_name = $1;';
        try {
            const res = await this.client.query(selectQuery, [player_name]);
            return res.rows;
        } catch (err) {
            console.error('Error fetching user by name:', err);
            return null;
        }
    }


    async get_all_users() {
        const selectQuery = 'SELECT * FROM users;';
        try {
            const res = await this.client.query(selectQuery);
            return res.rows;
        } catch (err) {
            console.error('Error fetching users:', err);
            return null;
        }
    }

    async get_rates_by_player_name(playerName) {
        const selectQuery = `
            SELECT r.dirt_probability, r.stone_probability, r.iron_probability, r.diamond_probability
            FROM rates r
            JOIN users u ON u.id = r.user_id
            WHERE u.player_name = $1;
        `;
        try {
            const res = await this.client.query(selectQuery, [playerName]);
            return res.rows;
        } catch (err) {
            console.error('Error fetching rates by player_name:', err);
            return null;
        }
    }

    async insert_rates_by_player_name(playerName) {
        const getUserIdQuery = 'SELECT id FROM users WHERE player_name = $1 LIMIT 1;';
        try {
            const userResult = await this.client.query(getUserIdQuery, [playerName]);
            if (userResult.rows.length === 0) {
                console.log(`Player ${playerName} not found.`);
                return;
            }
            const userId = userResult.rows[0].id;

            const insertQuery = `
                INSERT INTO rates (user_id)
                VALUES ($1)
                ON CONFLICT (user_id) DO NOTHING;
            `;
            await this.client.query(insertQuery, [userId]);
            console.log(` added ${playerName}'s rates.`);
        } catch (err) {
            console.error('Error inserting rates by player_name:', err);
        }
    }

    async update_rates_by_player_name(data) {
        const {playerName, dirt_probability, stone_probability, iron_probability, diamond_probability} = data;
        if (dirt_probability + stone_probability + iron_probability + diamond_probability != 100){
            return {success: false, reason: "probabilities does not sum to 100%"};
        }
        const getUserIdQuery = 'SELECT id FROM users WHERE player_name = $1 LIMIT 1;';
        try {
            const userResult = await this.client.query(getUserIdQuery, [playerName]);
            if (userResult.rows.length === 0) {
                console.log(`Player ${playerName} not found.`);
                return;
            }
            const userId = userResult.rows[0].id;

            const insertQuery = `
                UPDATE rates
                SET (dirt_probability, stone_probability, iron_probability, diamond_probability) =
                    ($1, $2, $3, $4)
                WHERE user_id = $5;
            `;
            await this.client.query(insertQuery, [dirt_probability, stone_probability, iron_probability, diamond_probability, userId]);
            console.log(` updated ${playerName}'s rates.`);
            return {success: true};
        } catch (err) {
            console.error('Error updating rates by player_name:', err);
            return  {success: false};
        }
    }

    async update_player_stats(player, winner=false) {
        const playerName = player.name;
        const points = player.board.points;
        try {
            const userResult = await this.get_user_by_player_name(playerName);
            if (userResult === null) {
                console.log(`Player ${playerName} not found.`);
                return ;
            }
            const userId = userResult[0].id;
            let {dirt_collected, dirt_owned} = userResult[0];
            let {stone_collected, stone_owned} = userResult[0];
            let {iron_collected, iron_owned} = userResult[0];
            let {diamond_collected, diamond_owned} = userResult[0];
            let {time_played, game_played, game_won} = userResult[0];

            dirt_collected += points[0];
            dirt_owned += points[0];
            stone_collected += points[1];
            stone_owned += points[1];
            iron_collected += points[2];
            iron_owned += points[2];
            diamond_collected += points[3];
            diamond_owned += points[3];

            time_played += player.time_played;
            game_played += 1;
            if(winner){
                game_won += 1;
            }


            const insertQuery = `
                UPDATE users
                SET (dirt_collected, dirt_owned, stone_collected, stone_owned, iron_collected, iron_owned, diamond_collected, diamond_owned, time_played, game_played, game_won) =
                    ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                WHERE id = $12;
            `;
            await this.client.query(insertQuery, [dirt_collected, dirt_owned, stone_collected, stone_owned, iron_collected, iron_owned, diamond_collected, diamond_owned, time_played, game_played, game_won, userId]);
            console.log(` updated ${playerName}'s stats.`);
            return {success: true};
        } catch (err) {
            console.error(`Error updating ${playerName}'s stats:`, err);
            return  {success: false};
        }
    }

    async close() {
        await this.pool.end();
        console.log('Pool closed');
    }
}
