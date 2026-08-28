from http.server import BaseHTTPRequestHandler, HTTPServer
import win32print

PRINTER_NAME = "Xprinter XP-58"


class PrinterHandler(BaseHTTPRequestHandler):

    def cors(self):
        self.send_header(
            "Access-Control-Allow-Origin",
            "*"
        )
        self.send_header(
            "Access-Control-Allow-Methods",
            "GET, POST, OPTIONS"
        )
        self.send_header(
            "Access-Control-Allow-Headers",
            "Content-Type, *"
        )

    def do_OPTIONS(self):
        self.send_response(204)
        self.cors()
        self.end_headers()

    def do_GET(self):

        self.send_response(200)
        self.cors()
        self.end_headers()

        self.wfile.write(
            b"XP-58 ESC/POS bridge is running!"
        )

    def do_POST(self):

        if self.path != "/print":
            self.send_response(404)
            self.cors()
            self.end_headers()
            return

        length = int(
            self.headers.get("Content-Length", 0)
        )

        data = self.rfile.read(length)

        print("Received", len(data), "bytes")

        try:

            printer = win32print.OpenPrinter(
                PRINTER_NAME
            )

            win32print.StartDocPrinter(
                printer,
                1,
                ("ESC/POS", None, "RAW")
            )

            win32print.StartPagePrinter(printer)

            win32print.WritePrinter(
                printer,
                data
            )

            win32print.EndPagePrinter(printer)
            win32print.EndDocPrinter(printer)

            win32print.ClosePrinter(printer)

            print("RAW data sent successfully!")

            self.send_response(200)
            self.cors()
            self.end_headers()

            self.wfile.write(b"PRINTED")

        except Exception as e:

            print("PRINTER ERROR:", e)

            self.send_response(500)
            self.cors()
            self.end_headers()

            self.wfile.write(
                str(e).encode()
            )

    def log_message(self, format, *args):
        print(format % args)


server = HTTPServer(
    ("127.0.0.1", 9100),
    PrinterHandler
)

print("XP-58 ESC/POS Bridge")
print("Listening on http://127.0.0.1:9100")
print("Printer:", PRINTER_NAME)
print()

server.serve_forever()