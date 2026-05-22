from __future__ import annotations

import argparse
import webbrowser

from .app import SynraApp
from .config import StateStore, load_config
from .server import serve


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the NodeSpark Synra Jetson monitor companion.")
    parser.add_argument("--config", help="Path to config.toml")
    parser.add_argument("--host", help="Override HTTP bind host")
    parser.add_argument("--port", type=int, help="Override HTTP port")
    args = parser.parse_args()

    cfg = load_config(args.config)
    if args.host:
        cfg.server.host = args.host
    if args.port:
        cfg.server.port = args.port

    app = SynraApp(cfg, StateStore())
    app.start_background()

    url = f"http://127.0.0.1:{cfg.server.port}"
    if cfg.server.open_browser:
        webbrowser.open(url)

    try:
        serve(app, cfg.server.host, cfg.server.port)
    except KeyboardInterrupt:
        print("\n[synra] shutting down")
    finally:
        app.stop()


if __name__ == "__main__":
    main()

