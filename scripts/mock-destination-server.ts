import http from "http";

const server = http.createServer((req, res) => {
  if (req.method === "POST") {
    req.on("data", () => {}); // drain the body, don't bother parsing it
    req.on("end", () => {
      res.writeHead(200);
      res.end();
    });
  } else {
    res.writeHead(404);
    res.end();
  }
});

server.listen(4000, () => {
  console.log("Mock destination server listening on port 4000");
});