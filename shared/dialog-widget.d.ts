import type { Agent } from '../src/ara/types';
import type { RingsProps } from '../src/widgets/arra-widgets.ios';
export function dialogProps(agents: Agent[], now?: number): RingsProps;
export function compactDialogProps(props: RingsProps): Omit<RingsProps, 'agents'> & {agents: unknown[][]};
