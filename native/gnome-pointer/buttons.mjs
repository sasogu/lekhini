// Normalized bridge bits, independent of Clutter modifier numbering.
const BUTTONS = [[1, 'left'], [2, 'middle'], [4, 'right']];

export class ButtonTransitions {
    previous = null;

    reset() { this.previous = null; }

    update(mask, x, y) {
        const pressed = this.previous === null ? 0 : mask & ~this.previous;
        this.previous = mask;
        return BUTTONS.filter(([bit]) => pressed & bit)
            .map(([, button]) => ({type: 'click', button, x, y}));
    }
}
