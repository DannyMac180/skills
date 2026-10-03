import { describe, expect, test, tier } from 'claude-code/testing'

tier('user')

describe('register', () => {
  test('/my-command answers without touching the model', async ($, on) => {
    const registered: string[] = []
    on('command.register', ($, e) => {
      registered.push(e.name)
      return { value: { command: e.name } }
    })
    on('session.start', ($, e) => ({ cwd: e.cwd }))

    await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
    expect(registered).toEqual(['my-command'])

    const { text } = await $.command.run({ command: 'my-command', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } })
    expect(text).toBe('hello from my-mod')
  })
})
