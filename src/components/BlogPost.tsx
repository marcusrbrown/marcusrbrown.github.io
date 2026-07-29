import type {BlogPostMeta} from '../types'
import React from 'react'
import {Link} from 'react-router-dom'

const BlogPost: React.FC<BlogPostMeta> = ({slug, title, date, summary, tags}) => {
  const formatDate = (dateStr: string): string => {
    return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'UTC',
    })
  }

  const formattedDate = formatDate(date)

  return (
    <article className="blog-post">
      <h2 className="blog-post__title">
        <Link className="blog-post__title-link" to={`/blog/${slug}`}>
          {title}
        </Link>
      </h2>
      <time className="blog-post__date" dateTime={date}>
        {formattedDate}
      </time>
      <p className="blog-post__summary">{summary}</p>
      {tags && tags.length > 0 && (
        <div className="blog-post__topics">
          <span>Topics:</span>
          <ul className="blog-post__tags" aria-label="Tags">
            {tags.map(tag => (
              <li key={tag} className="blog-post__tag">
                {tag}
              </li>
            ))}
          </ul>
        </div>
      )}
      <span className="blog-post__read-more">Read article</span>
    </article>
  )
}

export default BlogPost
