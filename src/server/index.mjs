import { createAppServer } from "./app.mjs";
import { readConfig } from "./config.mjs";

const config = readConfig();
const server = createAppServer(config);

server.listen(config.port, config.host, () => {
  console.log(`Morning Call running at http://${config.host}:${config.port}`);
});

function shutdown() {
  server.close((error) => {
    if (error) {
      console.error(error);
      process.exitCode = 1;
    }
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
