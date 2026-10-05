# Servidor local do jogo: igual ao "python -m http.server", mas manda o navegador
# NÃO guardar cache. Sem isso, o navegador reaproveita versões antigas dos
# módulos .js e as mudanças no código não aparecem ao recarregar a página.
# Uso: python serve.py        (depois abrir http://localhost:8000)
#      python serve.py 8080   (outra porta, se a 8000 estiver ocupada)
import http.server
import socket
import socketserver
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    # .md como texto: sem isso o Python manda application/octet-stream e o
    # navegador baixa o arquivo em vez de mostrar (links dos slides)
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      ".md": "text/plain; charset=utf-8"}

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


class DualStackServer(socketserver.ThreadingTCPServer):
    # Escuta em IPv6 e IPv4 ao mesmo tempo: "localhost" costuma resolver para
    # ::1 (IPv6) primeiro, e um servidor só em IPv4 pode ser "atropelado" por
    # outro processo na mesma porta em IPv6.
    address_family = socket.AF_INET6
    allow_reuse_address = True

    def server_bind(self):
        self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
        super().server_bind()


if __name__ == "__main__":
    with DualStackServer(("::", PORT), NoCacheHandler) as httpd:
        print(f"Servindo em http://localhost:{PORT} (sem cache) — Ctrl+C para parar")
        httpd.serve_forever()
