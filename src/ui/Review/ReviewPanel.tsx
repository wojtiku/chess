import { openQueue } from '../../teaching/record';
import './ReviewPanel.css';

/**
 * The review queue.
 *
 * Empty on a first visit, and it says so rather than spinning: a queue that has
 * nothing in it is a fact, and a spinner that never resolves is indistinguishable
 * from a broken app. The wording is the important part — it says the queue is
 * built from mistakes, not that nothing has happened *yet* in a way that implies
 * something is loading.
 */
export default function ReviewPanel({ record, onLearn }: {
  record?: { reviewItems: Array<{ id: string; conceptId: string }> };
  onLearn?: () => void;
}) {
  const queue = record ? openQueue(record as never) : [];

  if (queue.length === 0) {
    return (
      <div className="review">
        <h2>Review</h2>
        <p className="review-lede">Return to a position with fresh eyes.</p>
        <p className="review-empty" data-testid="review-empty">
          Nothing to review yet. Positions where you made a mistake collect here, so you can try them
          again when you have a moment.
        </p>
        {onLearn && <button className="review-start" type="button" onClick={onLearn}>Learn the basics</button>}
      </div>
    );
  }

  return (
    <div className="review">
      <h2>Review</h2>
      <ul className="review-queue">
        {queue.map((item) => (
          <li key={item.id} data-testid={`review-item-${item.id}`}>
            {item.conceptId}
          </li>
        ))}
      </ul>
    </div>
  );
}
