import {
  validateGripperAction,
  type GripperAction,
  type GripperTarget,
} from '@botlab/model';
/** Operator intent only; transitions and balancing remain owned by the official FSM. */
export class JumperGripper {
  side: 'left' | 'right' | undefined;
  closed = false;
  desiredMode = 'locomotion';
  private switchKey: string | undefined;
  private sent = false;
  target(action: GripperAction): GripperTarget {
    validateGripperAction(action);
    if (action.startsWith('prepare-')) {
      if (this.side) throw new Error('Recoge la pinza antes de preparar otra.');
      this.side = action === 'prepare-left' ? 'left' : 'right';
      this.desiredMode = 'claw_' + this.side;
      this.closed = false;
      this.switchKey = this.side === 'left' ? 'key_v' : 'key_b';
      this.sent = false;
    } else {
      if (!this.side)
        throw new Error(
          'Prepara una pinza antes de abrirla, cerrarla o recogerla.',
        );
      if (action === 'stow') {
        if (this.closed) throw new Error('Abre la pinza antes de recogerla.');
        this.desiredMode = 'locomotion';
        this.switchKey = this.side === 'left' ? 'key_v' : 'key_b';
        this.sent = false;
      } else this.closed = action === 'close';
    }
    const side = this.side!;
    const prefix = side === 'left' ? 'LF' : 'RF';
    const sign = side === 'left' ? 1 : -1;
    return {
      side,
      position: action === 'stow' ? 'stowed' : this.closed ? 'closed' : 'open',
      joints:
        action === 'stow'
          ? [{ name: prefix + '_J4_joint', radians: 0 }]
          : [
              -0.5236,
              -1.5708,
              -0.5236,
              -1.309,
              this.closed ? 0.1 : 0.1 - Math.PI / 3,
            ].map((radians, i) => ({
              name: `${prefix}_J${i}_joint`,
              radians: i === 1 ? radians : radians * sign,
            })),
    };
  }
  keys(): { key: string; down: boolean }[] {
    const result = ['key_v', 'key_b'].map((key) => ({
      key,
      down: !this.sent && key === this.switchKey,
    }));
    this.sent = true;
    return result;
  }
  complete() {
    if (this.desiredMode === 'locomotion') this.side = undefined;
  }
  reset() {
    this.side = undefined;
    this.closed = false;
    this.desiredMode = 'locomotion';
    this.switchKey = undefined;
    this.sent = false;
  }
}
