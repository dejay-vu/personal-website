import Link from 'next/link';

import { GitHubIcon, InstagramIcon, LinkedInIcon } from './ui/Icons';

export default function Social() {
  return (
    <div className="flex flex-row items-center gap-3">
      <Link
        href="https://github.com/dejay-vu"
        target="_blank"
        color="foreground"
        aria-label="GitHub"
      >
        <GitHubIcon />
      </Link>
      <Link
        href="https://linkedin.com/in/junhao-zh"
        target="_blank"
        color="foreground"
        aria-label="LinkedIn"
      >
        <LinkedInIcon />
      </Link>
      <Link
        href="https://instagram.com/dejay_vu_"
        target="_blank"
        color="foreground"
        aria-label="Instagram"
      >
        <InstagramIcon />
      </Link>
    </div>
  );
}
