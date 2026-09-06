require('./benchmark-runner.cjs')
  .run(process.argv.slice(2))
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
