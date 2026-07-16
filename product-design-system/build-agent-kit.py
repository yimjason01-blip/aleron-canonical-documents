#!/usr/bin/env python3
import argparse, json, pathlib, sys
ROOT = pathlib.Path(__file__).resolve().parent

def load():
    return json.loads((ROOT / "tokens.json").read_text())

def flatten(node, prefix=()):
    out = {}
    for key, value in node.items():
        path = prefix + (key,)
        if isinstance(value, dict) and "$value" in value:
            out[".".join(path)] = value
        elif isinstance(value, dict):
            out.update(flatten(value, path))
    return out

def css_value(value, flat):
    if isinstance(value, str) and value.startswith("{") and value.endswith("}"):
        path = value[1:-1]
        if path not in flat:
            raise KeyError(f"Unknown token alias: {path}")
        return f"var({flat[path]['css']})"
    return str(value)

def render(data):
    flat = flatten(data["tokens"])
    lines = ["/* Generated from tokens.json. Do not edit directly. */"]
    for face in data.get("font_faces", []):
        lines.extend(["@font-face {", f"  font-family: '{face['family']}';", f"  src: url('{face['src']}') format('truetype');", f"  font-weight: {face['weight']};", f"  font-style: {face['style']};", "  font-display: swap;", "}"])
    lines.append(":root {")
    for path, token in flat.items():
        lines.append(f"  {token['css']}: {token['$value']};")
    for name, value in data["registers"]["day"].items():
        lines.append(f"  --{name}: {css_value(value, flat)};")
    lines.append("}")
    lines.append('.night, [data-register="flight-deck"] {')
    for name, value in data["registers"]["flight-deck"].items():
        lines.append(f"  --{name}: {css_value(value, flat)};")
    lines.append("}")
    return "\n".join(lines) + "\n"

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    output = render(load())
    target = ROOT / "tokens.css"
    if args.check:
        if not target.exists() or target.read_text() != output:
            print("tokens.css is stale", file=sys.stderr)
            return 1
        print("tokens.css matches tokens.json")
        return 0
    target.write_text(output)
    print(f"wrote {target}")
    return 0
if __name__ == "__main__":
    raise SystemExit(main())
