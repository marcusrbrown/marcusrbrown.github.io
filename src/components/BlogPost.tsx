import React from 'react'

interface BlogPostProps {
  title: string
  date: string
  summary: string
  url: string
}

const BlogPost: React.FC<BlogPostProps> = ({title, date, summary, url}) => {
  return (
    <article className="blog-post">
      <h2>{title}</h2>
      <time dateTime={date}>{date}</time>
      <p>{summary}</p>
      <a href={url} target="_blank" rel="noopener noreferrer">
        Read more
      </a>
    </article>
  )
}

export default BlogPost
