import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('Collide 1.0 workbench shell', () => {
  it('renders the systems-lab workbench as the first screen', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Memory Coalescing' })).toBeInTheDocument()
    const rail = within(screen.getByLabelText('Labs and simulation controls'))
    expect(rail.getByRole('button', { name: /Bank Conflicts/ })).toBeInTheDocument()
    expect(rail.getByRole('button', { name: /Divergence/ })).toBeInTheDocument()
    expect(rail.getByRole('button', { name: /Reduce \/ Scan/ })).toBeInTheDocument()
    expect(rail.getByRole('button', { name: /Occupancy/ })).toBeInTheDocument()
    expect(screen.getByTestId('learning-path')).toHaveTextContent('1 / 5')
    expect(rail.getByRole('heading', { name: /Start Here/ })).toBeInTheDocument()
    expect(screen.getByTestId('learning-coach')).toHaveTextContent('See how a warp turns lane addresses')
    expect(screen.getByText('What This Shows')).toBeInTheDocument()
    expect(screen.getByLabelText('Pipeline timeline')).toBeInTheDocument()
  })

  it('switches labs and shows lab-specific metrics', async () => {
    const user = userEvent.setup()
    render(<App />)
    const rail = within(screen.getByLabelText('Labs and simulation controls'))
    await user.click(rail.getByRole('button', { name: /Bank Conflicts/ }))
    expect(screen.getByRole('heading', { name: 'Shared Memory Bank Conflicts' })).toBeInTheDocument()
    expect(screen.getByText('Conflict Degree')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Stride 16/ }))
    expect(screen.getAllByText('16x').length).toBeGreaterThan(0)
  })

  it('opens the notes panel from the top docs action', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: /Docs/ }))
    expect(screen.getByText('What This Shows')).toBeInTheDocument()
    expect(screen.getByText(/Model Honesty/)).toBeInTheDocument()
  })

  it('renders WebGPU status and share controls', () => {
    render(<App />)
    expect(screen.getByTestId('webgpu-status')).toHaveTextContent(/WebGPU:/)
    expect(screen.getByRole('button', { name: /Share/ })).toBeInTheDocument()
  })

  it('keeps the central canvas meaningful for occupancy', async () => {
    const user = userEvent.setup()
    render(<App />)
    const rail = within(screen.getByLabelText('Labs and simulation controls'))
    await user.click(rail.getByRole('button', { name: /Occupancy/ }))
    const canvas = screen.getByTestId('lab-canvas')
    expect(within(canvas).getByText('Latency Hiding')).toBeInTheDocument()
    expect(within(canvas).getAllByText(/resident warps/i).length).toBeGreaterThan(0)
  })
})
