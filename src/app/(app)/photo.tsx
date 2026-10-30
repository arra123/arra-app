import { SendToComputer } from '@/components/send-to-pc';

/** The «Фото на ПК» widget: arra://photo sends the newest photo into the computer's clipboard. */
export default function PhotoToComputer() {
  return <SendToComputer kind="photo" />;
}
