// Settings adapter keeps the user's accessibility preferences independent
// of the lifetime of a Lekhini client. No pixels or input are acquired here.
export class ZoomLease {
    constructor(settings) {
        this.settings = settings;
        this.owner = null;
        this.saved = null;
        this.appliedZoom = null;
    }

    update(owner, enabled, zoom) {
        if (!Number.isFinite(zoom) || ![1.5, 2, 3, 4].includes(zoom))
            throw new RangeError('Unsupported zoom level');
        if (this.owner && this.owner !== owner)
            throw new Error('Desktop zoom is already controlled by another client');
        if (!enabled) {
            this.release(owner);
            return;
        }
        if (!this.owner) {
            this.saved = {enabled: this.settings.enabled, zoom: this.settings.zoom};
            this.owner = owner;
        }
        this.settings.zoom = zoom;
        this.settings.enabled = true;
        this.appliedZoom = zoom;
    }

    release(owner) {
        if (!this.owner || owner !== this.owner) return;
        // Keep a value the user changed separately while Lekhini was active.
        if (this.settings.zoom === this.appliedZoom) this.settings.zoom = this.saved.zoom;
        if (this.settings.enabled === true) this.settings.enabled = this.saved.enabled;
        this.owner = null;
        this.saved = null;
        this.appliedZoom = null;
    }
}
