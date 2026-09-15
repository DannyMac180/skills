import type { Register } from 'claude-code'

// A minimal mod: registers one slash command at session start and answers it
// without passing it on. Replace with whatever you are actually building.

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)

    // A registration that fails must not reject into the engine: an unhandled
    // rejection here unmounts the whole module.
    await $.command
      .register({
        name: 'my-command',
        description: 'What this command does (my-mod)',
        immediate: true,
      })
      .catch(err => $.ui.log(`my-mod: /my-command not registered: ${err}`))

    return result
  })

  // This hook answers the command itself, so it never calls next(e).
  on('command.run', { command: 'my-command' }, async ($, e) => {
    return { text: 'hello from my-mod' }
  })
}
