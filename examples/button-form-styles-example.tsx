import React, {useState} from 'react'

/**
 * Example component demonstrating the new theme-aware button and form styles
 * This showcases all button variants and form elements with the theme system integration
 */
const ButtonFormStylesExample: React.FC = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    message: '',
    category: '',
    newsletter: false,
    priority: 'medium',
  })

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [success, setSuccess] = useState<Record<string, boolean>>({})

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const {name, value, type} = e.target
    const checked = (e.target as HTMLInputElement).checked

    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }))

    // Clear error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({...prev, [name]: ''}))
    }

    // Simple validation demo
    if (name === 'email' && value) {
      const isValidEmail = /^[^\s@]+@[^\s@][^\s.@]*\.[^\s@]+$/u.test(value)
      if (isValidEmail) {
        setSuccess(prev => ({...prev, email: true}))
        setErrors(prev => ({...prev, email: ''}))
      } else {
        setSuccess(prev => ({...prev, email: false}))
        setErrors(prev => ({...prev, email: 'Please enter a valid email address'}))
      }
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // Handle form submission logic here
  }

  return (
    <div style={{maxWidth: '800px', margin: '2rem auto', padding: '2rem'}}>
      <h1>Button & Form Styles Demo</h1>
      <p style={{marginBottom: '2rem', color: 'var(--color-text-secondary)'}}>
        Demonstration of theme-aware button and form components that adapt to light and dark themes.
      </p>

      {/* Button Examples */}
      <section style={{marginBottom: '3rem'}}>
        <h2>Button Variants</h2>

        <div style={{display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem'}}>
          <button type="button" className="btn btn--primary">
            Primary Button
          </button>
          <button type="button" className="btn btn--secondary">
            Secondary Button
          </button>
          <button type="button" className="btn btn--danger">
            Danger Button
          </button>
          <button type="button" className="btn btn--success">
            Success Button
          </button>
          <button type="button" className="btn btn--warning">
            Warning Button
          </button>
        </div>

        <div style={{display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem'}}>
          <button type="button" className="btn btn--outline">
            Outline Primary
          </button>
          <button type="button" className="btn btn--outline-secondary">
            Outline Secondary
          </button>
          <button type="button" className="btn btn--primary" disabled>
            Disabled Button
          </button>
        </div>

        <div style={{display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center'}}>
          <button type="button" className="btn btn--primary btn--small">
            Small Button
          </button>
          <button type="button" className="btn btn--primary">
            Default Button
          </button>
          <button type="button" className="btn btn--primary btn--large">
            Large Button
          </button>
        </div>
      </section>

      {/* Form Examples */}
      <section>
        <h2>Form Elements</h2>

        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="name" className="form-label form-label--required">
                Full Name
              </label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                className="form-input"
                placeholder="Enter your full name"
                required
              />
              <div className="form-help-text">This will be used for your profile</div>
            </div>

            <div className="form-group">
              <label htmlFor="email" className="form-label form-label--required">
                Email Address
              </label>
              <input
                type="email"
                id="email"
                name="email"
                value={formData.email}
                onChange={handleInputChange}
                className={`form-input ${
                  errors.email ? 'form-input--error' : success.email ? 'form-input--success' : ''
                }`}
                placeholder="you@example.com"
                required
              />
              {errors.email && <div className="form-error-text">{errors.email}</div>}
              {success.email && <div className="form-success-text">Email format is valid</div>}
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="category" className="form-label">
              Category
            </label>
            <select
              id="category"
              name="category"
              value={formData.category}
              onChange={handleInputChange}
              className="form-select"
            >
              <option value="">Select a category...</option>
              <option value="general">General Inquiry</option>
              <option value="support">Technical Support</option>
              <option value="feedback">Feedback</option>
              <option value="business">Business Inquiry</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="message" className="form-label">
              Message
            </label>
            <textarea
              id="message"
              name="message"
              value={formData.message}
              onChange={handleInputChange}
              className="form-textarea"
              placeholder="Enter your message here..."
              rows={4}
            />
          </div>

          <div className="form-group">
            <div className="form-inline">
              <input
                type="checkbox"
                id="newsletter"
                name="newsletter"
                checked={formData.newsletter}
                onChange={handleInputChange}
                className="form-checkbox"
              />
              <label htmlFor="newsletter" className="form-label">
                Subscribe to newsletter
              </label>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Priority Level</label>
            <div style={{display: 'flex', gap: '1rem'}}>
              {['low', 'medium', 'high'].map(priority => (
                <div key={priority} className="form-inline">
                  <input
                    type="radio"
                    id={`priority-${priority}`}
                    name="priority"
                    value={priority}
                    checked={formData.priority === priority}
                    onChange={handleInputChange}
                    className="form-radio"
                  />
                  <label htmlFor={`priority-${priority}`} className="form-label">
                    {priority.charAt(0).toUpperCase() + priority.slice(1)}
                  </label>
                </div>
              ))}
            </div>
          </div>

          <div style={{display: 'flex', gap: '1rem', marginTop: '2rem'}}>
            <button type="submit" className="btn btn--primary">
              Submit Form
            </button>
            <button type="button" className="btn btn--outline-secondary">
              Cancel
            </button>
            <button
              type="button"
              className="btn btn--danger btn--small"
              onClick={() => {
                setFormData({
                  name: '',
                  email: '',
                  message: '',
                  category: '',
                  newsletter: false,
                  priority: 'medium',
                })
                setErrors({})
                setSuccess({})
              }}
            >
              Reset
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}

export default ButtonFormStylesExample
