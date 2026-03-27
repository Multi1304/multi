export class EventStream {
  private clients: any[] = [];

  addClient(req: any, res: any) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.(); // flush headers immediately

    this.clients.push(res);

    req.on('close', () => {
      this.clients = this.clients.filter(client => client !== res);
    });
  }

  broadcast(event: string, data: any) {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    this.clients.forEach(client => {
      try {
        client.write(payload);
      } catch (err) {
        // Drop dead clients
      }
    });
  }
}
