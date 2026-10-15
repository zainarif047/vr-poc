import { Html } from '@react-three/drei';
import type { ComponentProps } from 'react';

/** DOM overlay target owned by the Sim screen, so label teardown never races the canvas teardown. */
export const labelPortal: { current: HTMLElement | null } = { current: null };

export function Label(props: ComponentProps<typeof Html>) {
  return <Html portal={labelPortal as React.MutableRefObject<HTMLElement>} {...props} />;
}
