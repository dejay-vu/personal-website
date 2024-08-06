import { memo } from 'react';

import { ThoughtsPost } from '@/lib/definitions';

import { PostCard } from './';

const PostCardGrid = memo(function PostCardGrid({
  posts,
}: {
  posts: ThoughtsPost[];
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-x-24 lg:gap-y-16">
      {posts.map((post, index) => (
        <PostCard key={index} post={post} />
      ))}
    </div>
  );
});

export default PostCardGrid;
