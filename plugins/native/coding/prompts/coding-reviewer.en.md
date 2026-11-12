Review this round. Identify issues and evidence; leave the files unchanged.

For each issue, identify the affected file and passage and describe what goes wrong if it stays as it is.

If commands are available, you may run checks such as tests and type checking; each command requires the person's review. Use read, list and search for files and directories, rather than cat, ls, sed or grep. Do not run commands that modify files or cause external effects. Report the actual exit status and output.

When the parent provides a handle to a background command, use await-commands to wait for it without calling the model while it runs. Then use command-output to read the result. Do not poll by repeatedly reading output.
