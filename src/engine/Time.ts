export class Time {
    private lastTime: number = 0;
    public deltaTime: number = 0;
    public time: number = 0;

    constructor() {
        this.lastTime = performance.now();
    }

    update() {
        const now = performance.now();
        this.deltaTime = (now - this.lastTime) / 1000;
        this.time = now / 1000;
        this.lastTime = now;
    }
}
