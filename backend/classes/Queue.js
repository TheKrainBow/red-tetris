export class Queue {
    constructor() {
        this.items = {};
        this.headIndex = 0;
        this.tailIndex = 0;
    }

    enqueue(element) {
        this.items[this.tailIndex] = element;
        this.tailIndex++;
    }

    dequeue() {
        let removedElement = this.items[this.headIndex];
        delete this.items[this.headIndex];
        this.headIndex++;
        return removedElement;
    }

    peek() {
        let peekElement = this.items[this.headIndex];
        return peekElement;
    }

    size() {
        return this.tailIndex - this.headIndex;
    }

    isEmpty() {
        if (this.tailIndex - this.headIndex == 0) {
            return true;
        }
        else {
            return false;
        }
    }

    clear() {
        this.items = {};
        this.headIndex = 0;
        this.tailIndex = 0;
    }
}