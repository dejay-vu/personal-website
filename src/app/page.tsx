import { Greetings, Timeline } from '@/components/home';

export default function Home() {
  const textStyles = 'mb-4';
  return (
    <article className="my-8 sm:my-0 mx-auto">
      <div className="flex flex-col justify-center items-center xl:flex-row-reverse xl:gap-16">
        <section
          className="flex-1 leading-8 max-w-prose"
          aria-label="greetings"
        >
          <Greetings />

          <p className={textStyles}>
            I&apos;m Junhao Zhang (张俊豪), but you can call me Jay because it
            sounds cooler and it&apos;s easier to remember. I&apos;m a Machine
            Learning Software Engineer who geeks out over GPU programming and
            advanced computing systems. My superpower? Making computers think
            faster and smarter, all while keeping my sanity (mostly) intact.
          </p>

          <p className={textStyles}>
            I&apos;ve spent my professional life optimizing performance for some
            of the biggest names in tech, like Huggingface, Alibaba, and
            Microsoft. Imagine tweaking Llama2-70B models and working on
            cutting-edge AI projects while balancing on a
            unicycle&mdash;that&apos;s my daily grind, except the unicycle is my
            standing desk chair and I don&apos;t actually ride it… yet.
          </p>

          <p className={textStyles}>
            When I&apos;m not busy making GPUs do my bidding, you can find me
            diving into new tech like Next.js and TypeScript. If that sounds a
            bit too nerdy, I also dabble in hobbies that involve less coding:
            hiking up tall mountains, scuba diving into the deep blue, and
            capturing the world through my camera lens.
          </p>
        </section>

        <section className="flex-1 max-w-prose" aria-label="timeline">
          <Timeline />
        </section>
      </div>
    </article>
  );
}
