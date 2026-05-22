#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


REQUIRED_EXPRESSIONS = {
    "neutral",
    "happy",
    "attentive",
    "focused",
    "curious",
    "concerned",
    "wink",
}

REQUIRED_MOTION_GROUPS = {
    "idle",
    "listen",
    "think",
    "talk",
    "success",
    "concerned",
    "approval",
}


def load_json(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise SystemExit(f"invalid JSON in {path}: {exc}") from exc


def file_ref_exists(root: Path, rel_path: str | None, label: str, errors: list[str]) -> None:
    if not rel_path:
        errors.append(f"missing {label} reference")
        return
    path = root / rel_path
    if not path.is_file():
        errors.append(f"missing {label} file: {rel_path}")


def validate_pack(model_path: Path) -> int:
    errors: list[str] = []
    warnings: list[str] = []

    if not model_path.is_file():
        print(f"miss {model_path}")
        return 1

    root = model_path.parent
    model = load_json(model_path)
    refs = model.get("FileReferences") or {}

    file_ref_exists(root, refs.get("Moc"), "MOC", errors)

    textures = refs.get("Textures") or []
    if not textures:
        errors.append("missing texture references")
    for texture in textures:
        file_ref_exists(root, texture, "texture", errors)

    expressions = refs.get("Expressions") or []
    expression_names = {item.get("Name") for item in expressions if isinstance(item, dict)}
    for expression in sorted(REQUIRED_EXPRESSIONS - expression_names):
        errors.append(f"missing expression: {expression}")
    for item in expressions:
        if isinstance(item, dict):
            file_ref_exists(root, item.get("File"), f"expression {item.get('Name')}", errors)

    motions = refs.get("Motions") or {}
    motion_groups = set(motions.keys())
    for group in sorted(REQUIRED_MOTION_GROUPS - motion_groups):
        errors.append(f"missing motion group: {group}")
    for group, motion_list in motions.items():
        if not isinstance(motion_list, list) or not motion_list:
            errors.append(f"motion group has no motions: {group}")
            continue
        for index, motion in enumerate(motion_list):
            if isinstance(motion, dict):
                file_ref_exists(root, motion.get("File"), f"motion {group}[{index}]", errors)

    physics = refs.get("Physics")
    if physics:
        file_ref_exists(root, physics, "physics", errors)
    else:
        warnings.append("missing optional physics reference")

    pose = refs.get("Pose")
    if pose:
        file_ref_exists(root, pose, "pose", errors)
    else:
        warnings.append("missing optional pose reference")

    if warnings:
        for warning in warnings:
            print(f"warn {warning}")

    if errors:
        for error in errors:
            print(f"miss {error}")
        return 1

    print(f"ok   {model_path}")
    print("ok   Live2D model pack matches Synra's runtime contract")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate the NodeSpark Synra Live2D runtime pack.")
    parser.add_argument(
        "model",
        nargs="?",
        default="web/assets/live2d/synra/synra.model3.json",
        help="Path to synra.model3.json",
    )
    args = parser.parse_args()
    return validate_pack(Path(args.model))


if __name__ == "__main__":
    sys.exit(main())
