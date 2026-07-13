import clsx from 'clsx';

export function NoteTitle({
  title,
  className,
}: {
  title: string;
  className?: string;
}) {
  return (
    <h2
      className={clsx(
        'neon-card__title line-clamp-2 min-h-[3.25rem] text-lg leading-snug md:min-h-[3.5rem] md:text-xl',
        className,
      )}
    >
      {title}
    </h2>
  );
}
