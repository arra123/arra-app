import { SendToComputer } from '@/components/send-to-pc';

/** The «Буфер на ПК» widget: arra://clip sends the phone's clipboard to the computer. */
export default function ClipToComputer() {
  return <SendToComputer kind="clip" />;
}
