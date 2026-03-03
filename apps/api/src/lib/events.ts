import { EventEmitter } from 'events';

class SystemEvents extends EventEmitter {
    constructor() {
        super();
        this.setMaxListeners(20);
    }
}

export const events = new SystemEvents();
export const hooks = events;
