#!/usr/bin/env python3
"""Generate Synra-specific Cubism motion clips for the Hiyori scaffold."""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MOTION_DIR = ROOT / "web/assets/live2d/synra/motions"
MODEL_PATH = ROOT / "web/assets/live2d/synra/synra.model3.json"


MOTIONS = {
    "Wave": {
        "file": "Synra_wave.motion3.json",
        "duration": 3.6,
        "curves": {
            "ParamShoulder": [(0, 0), (0.45, 0.22), (1.05, 0.36), (2.45, 0.3), (3.6, 0)],
            "ParamArmLB": [(0, 0), (0.45, 3.5), (1.05, 8.8), (2.45, 8.5), (3.6, 0)],
            "ParamArmRB": [(0, 0), (0.45, -3.5), (1.05, -8.2), (2.45, -8.5), (3.6, 0)],
            "ParamHandLB": [(0, 0), (0.45, -2.2), (1.05, -8.7), (1.45, -5.5), (1.85, -9.2), (2.25, -5.8), (2.65, -8.4), (3.6, 0)],
            "ParamHandRB": [(0, 0), (0.45, 1.1), (1.05, 1.8), (2.45, 1.2), (3.6, 0)],
            "ParamHandL": [(0, 0), (0.35, -1), (2.7, -1), (3.6, 0)],
            "ParamHandR": [(0, 0), (0.35, -0.2), (2.7, -0.2), (3.6, 0)],
            "ParamAngleZ": [(0, 0), (1.05, 2.4), (2.4, 1.2), (3.6, 0)],
            "ParamBodyAngleZ": [(0, 0), (1.05, -1.8), (2.4, -1.0), (3.6, 0)],
            "ParamMouthForm": [(0, 0), (0.55, 1), (2.8, 1), (3.6, 0)],
            "ParamEyeLSmile": [(0, 0), (0.8, 1), (2.5, 1), (3.6, 0)],
            "ParamEyeRSmile": [(0, 0), (0.8, 1), (2.5, 1), (3.6, 0)],
        },
    },
    "Explain": {
        "file": "Synra_explain.motion3.json",
        "duration": 3.2,
        "curves": {
            "ParamArmLB": [(0, 0), (0.55, 2.0), (1.45, 3.7), (2.4, 2.2), (3.2, 0)],
            "ParamArmRB": [(0, 0), (0.55, 1.4), (1.45, 2.8), (2.4, 3.4), (3.2, 0)],
            "ParamHandLB": [(0, 0), (0.55, -1.4), (1.45, -2.9), (2.4, -1.2), (3.2, 0)],
            "ParamHandRB": [(0, 0), (0.55, 1.4), (1.45, 2.2), (2.4, 2.9), (3.2, 0)],
            "ParamHandL": [(0, 0), (0.65, 0.55), (2.4, 0.7), (3.2, 0)],
            "ParamHandR": [(0, 0), (0.65, 0.4), (2.4, 0.75), (3.2, 0)],
            "ParamAngleX": [(0, 0), (1.0, -4), (2.2, 3), (3.2, 0)],
            "ParamBodyAngleZ": [(0, 0), (1.0, -1.2), (2.2, 1.0), (3.2, 0)],
            "ParamMouthForm": [(0, 0), (0.5, 0.55), (2.8, 0.55), (3.2, 0)],
        },
    },
    "Stretch": {
        "file": "Synra_stretch.motion3.json",
        "duration": 3.6,
        "curves": {
            "ParamShoulder": [(0, 0), (0.55, 0.45), (1.25, 1), (2.15, 0.82), (3.6, 0)],
            "ParamArmLB": [(0, 0), (0.6, 4.0), (1.3, 9.4), (2.2, 8.4), (3.6, 0)],
            "ParamArmRB": [(0, 0), (0.6, 4.0), (1.3, 9.2), (2.2, 8.7), (3.6, 0)],
            "ParamHandLB": [(0, 0), (0.6, 3.4), (1.3, 9.5), (2.2, 8.5), (3.6, 0)],
            "ParamHandRB": [(0, 0), (0.6, 3.4), (1.3, 9.5), (2.2, 8.5), (3.6, 0)],
            "ParamBodyAngleY": [(0, 0), (0.9, -4), (1.8, -6), (3.6, 0)],
            "ParamBodyAngleZ": [(0, 0), (1.0, -2), (2.2, 2), (3.6, 0)],
            "ParamLeg": [(0, 1), (1.1, 0.84), (2.4, 0.9), (3.6, 1)],
        },
    },
    "Delighted": {
        "file": "Synra_delighted.motion3.json",
        "duration": 2.4,
        "curves": {
            "ParamShoulder": [(0, 0), (0.45, 0.5), (1.3, 0.32), (2.4, 0)],
            "ParamArmLB": [(0, 0), (0.45, 5.3), (1.4, 4.2), (2.4, 0)],
            "ParamArmRB": [(0, 0), (0.45, 5.0), (1.4, 4.4), (2.4, 0)],
            "ParamHandLB": [(0, 0), (0.45, 5.6), (1.4, 4.6), (2.4, 0)],
            "ParamHandRB": [(0, 0), (0.45, 5.8), (1.4, 4.7), (2.4, 0)],
            "ParamMouthOpenY": [(0, 0), (0.35, 0.65), (1.7, 0.35), (2.4, 0)],
            "ParamMouthForm": [(0, 0), (0.25, 1), (1.9, 1), (2.4, 0)],
            "ParamEyeLSmile": [(0, 0), (0.35, 1), (1.7, 1), (2.4, 0)],
            "ParamEyeRSmile": [(0, 0), (0.35, 1), (1.7, 1), (2.4, 0)],
        },
    },
    "Playful": {
        "file": "Synra_playful.motion3.json",
        "duration": 2.6,
        "curves": {
            "ParamArmLB": [(0, 0), (0.75, 3.8), (1.55, 2.1), (2.6, 0)],
            "ParamHandLB": [(0, 0), (0.75, -4.6), (1.55, -2.2), (2.6, 0)],
            "ParamHandL": [(0, 0), (0.75, 0.75), (1.55, 0.55), (2.6, 0)],
            "ParamAngleZ": [(0, 0), (0.75, 3), (1.55, -1.5), (2.6, 0)],
            "ParamEyeBallX": [(0, 0), (0.75, -0.25), (1.55, 0.18), (2.6, 0)],
            "ParamMouthForm": [(0, 0), (0.5, 1), (1.8, 1), (2.6, 0)],
        },
    },
    "Curious": {
        "file": "Synra_curious.motion3.json",
        "duration": 2.4,
        "curves": {
            "ParamAngleX": [(0, 0), (0.85, -8), (1.6, 6), (2.4, 0)],
            "ParamAngleZ": [(0, 0), (0.85, 4), (1.6, -2.5), (2.4, 0)],
            "ParamEyeBallX": [(0, 0), (0.85, -0.35), (1.6, 0.25), (2.4, 0)],
            "ParamEyeBallY": [(0, 0), (0.85, 0.18), (1.6, 0.08), (2.4, 0)],
            "ParamBrowLY": [(0, 0), (0.85, 0.35), (1.6, 0.15), (2.4, 0)],
            "ParamBrowRY": [(0, 0), (0.85, -0.15), (1.6, 0.2), (2.4, 0)],
        },
    },
    "Determined": {
        "file": "Synra_determined.motion3.json",
        "duration": 2.6,
        "curves": {
            "ParamAngleY": [(0, 0), (0.8, -5), (1.7, -3), (2.6, 0)],
            "ParamBodyAngleZ": [(0, 0), (0.8, -1.2), (1.7, 1.4), (2.6, 0)],
            "ParamLeg": [(0, 1), (0.8, 0.88), (1.7, 0.92), (2.6, 1)],
            "ParamMouthForm": [(0, 0), (0.8, -0.3), (1.7, -0.15), (2.6, 0)],
            "ParamBrowLForm": [(0, 0), (0.8, -0.45), (1.7, -0.25), (2.6, 0)],
            "ParamBrowRForm": [(0, 0), (0.8, -0.45), (1.7, -0.25), (2.6, 0)],
        },
    },
    "SoftNod": {
        "file": "Synra_soft_nod.motion3.json",
        "duration": 1.5,
        "curves": {
            "ParamAngleY": [(0, 0), (0.42, -5), (0.78, 2.4), (1.08, -2), (1.5, 0)],
            "ParamBodyAngleZ": [(0, 0), (0.42, 0.6), (0.78, -0.3), (1.5, 0)],
        },
    },
    "HairTuck": {
        "file": "Synra_hair_tuck.motion3.json",
        "duration": 2.5,
        "curves": {
            "ParamArmLB": [(0, 0), (0.62, -2), (1.2, -4.8), (1.85, -3.1), (2.5, 0)],
            "ParamHandLB": [(0, 0), (0.62, 1.2), (1.2, 3.6), (1.85, 1.8), (2.5, 0)],
            "ParamHandL": [(0, 0), (0.62, 0.2), (1.2, 0.5), (1.85, 0.35), (2.5, 0)],
            "ParamAngleZ": [(0, 0), (1.2, 2.2), (1.85, 1), (2.5, 0)],
            "ParamEyeBallX": [(0, 0), (1.2, -0.2), (2.5, 0)],
        },
    },
    "IdleShift": {
        "file": "Synra_idle_shift.motion3.json",
        "duration": 2.8,
        "curves": {
            "ParamLeg": [(0, 1), (0.8, 0.9), (1.7, 0.96), (2.8, 1)],
            "ParamAngleZ": [(0, 0), (0.8, 2), (1.7, -1.8), (2.8, 0)],
            "ParamBodyAngleZ": [(0, 0), (0.8, -1.2), (1.7, 1), (2.8, 0)],
            "ParamSkirt": [(0, 0), (0.8, 0.25), (1.7, -0.2), (2.8, 0)],
        },
    },
    "Talk": {
        "file": "Synra_talk.motion3.json",
        "duration": 1.7,
        "curves": {
            "ParamArmLB": [(0, 0), (0.55, 1.5), (1.2, 1.9), (1.7, 0)],
            "ParamArmRB": [(0, 0), (0.55, 1.1), (1.2, 1.5), (1.7, 0)],
            "ParamHandLB": [(0, 0), (0.55, -0.8), (1.2, -1.1), (1.7, 0)],
            "ParamHandRB": [(0, 0), (0.55, 0.8), (1.2, 1.1), (1.7, 0)],
            "ParamMouthForm": [(0, 0), (0.35, 0.5), (1.25, 0.5), (1.7, 0)],
        },
    },
    "Listen": {
        "file": "Synra_listen.motion3.json",
        "duration": 1.9,
        "curves": {
            "ParamAngleY": [(0, 0), (0.7, -2.5), (1.35, 1), (1.9, 0)],
            "ParamEyeBallY": [(0, 0), (0.7, 0.15), (1.9, 0)],
            "ParamShoulder": [(0, 0), (0.7, 0.1), (1.9, 0)],
        },
    },
    "Think": {
        "file": "Synra_think.motion3.json",
        "duration": 2.4,
        "curves": {
            "ParamArmLB": [(0, 0), (0.8, -2.8), (1.6, -2.1), (2.4, 0)],
            "ParamHandLB": [(0, 0), (0.8, -2.2), (1.6, -1.6), (2.4, 0)],
            "ParamAngleZ": [(0, 0), (0.8, 1.4), (1.6, -0.8), (2.4, 0)],
            "ParamEyeBallX": [(0, 0), (0.8, -0.15), (1.6, 0.12), (2.4, 0)],
        },
    },
    "Concerned": {
        "file": "Synra_concerned.motion3.json",
        "duration": 2.3,
        "curves": {
            "ParamAngleY": [(0, 0), (0.9, -5.2), (1.65, -1.5), (2.3, 0)],
            "ParamAngleZ": [(0, 0), (0.9, -2), (1.65, 1), (2.3, 0)],
            "ParamMouthForm": [(0, 0), (0.8, -1), (1.6, -0.7), (2.3, 0)],
            "ParamBrowLForm": [(0, 0), (0.8, -1), (1.6, -0.6), (2.3, 0)],
            "ParamBrowRForm": [(0, 0), (0.8, -1), (1.6, -0.6), (2.3, 0)],
        },
    },
    "LookLeft": {"file": "Synra_look_left.motion3.json", "duration": 1.5, "curves": {"ParamAngleX": [(0, 0), (0.65, -16), (1.5, 0)], "ParamEyeBallX": [(0, 0), (0.65, -0.55), (1.5, 0)]}},
    "LookRight": {"file": "Synra_look_right.motion3.json", "duration": 1.5, "curves": {"ParamAngleX": [(0, 0), (0.65, 16), (1.5, 0)], "ParamEyeBallX": [(0, 0), (0.65, 0.55), (1.5, 0)]}},
    "LookUp": {"file": "Synra_look_up.motion3.json", "duration": 1.5, "curves": {"ParamAngleY": [(0, 0), (0.65, 12), (1.5, 0)], "ParamEyeBallY": [(0, 0), (0.65, 0.55), (1.5, 0)]}},
    "LookDown": {"file": "Synra_look_down.motion3.json", "duration": 1.5, "curves": {"ParamAngleY": [(0, 0), (0.65, -16), (1.5, 0)], "ParamEyeBallY": [(0, 0), (0.65, -0.55), (1.5, 0)]}},
}


def segments(points: list[tuple[float, float]]) -> list[float]:
    values: list[float] = [round(points[0][0], 3), round(points[0][1], 3)]
    for time, value in points[1:]:
      values.extend([0, round(time, 3), round(value, 3)])
    return values


def build_motion(name: str, spec: dict) -> dict:
    curves = [
        {
            "Target": "Parameter",
            "Id": param,
            "Segments": segments(points),
        }
        for param, points in spec["curves"].items()
    ]
    total_segments = sum(max(0, len(curve["Segments"]) - 2) // 3 for curve in curves)
    total_points = sum(1 + max(0, len(curve["Segments"]) - 2) // 3 for curve in curves)
    return {
        "Version": 3,
        "Meta": {
            "Duration": spec["duration"],
            "Fps": 30.0,
            "Loop": False,
            "AreBeziersRestricted": True,
            "CurveCount": len(curves),
            "TotalSegmentCount": total_segments,
            "TotalPointCount": total_points,
            "UserDataCount": 0,
            "TotalUserDataSize": 0,
        },
        "Curves": curves,
    }


def main() -> None:
    MOTION_DIR.mkdir(parents=True, exist_ok=True)
    model = json.loads(MODEL_PATH.read_text())
    motions = model.setdefault("FileReferences", {}).setdefault("Motions", {})
    for name, spec in MOTIONS.items():
        path = MOTION_DIR / spec["file"]
        path.write_text(json.dumps(build_motion(name, spec), indent=2) + "\n")
        motions[name] = [
            {
                "File": f"motions/{spec['file']}",
                "FadeInTime": 0.42,
                "FadeOutTime": 0.45,
            }
        ]
    MODEL_PATH.write_text(json.dumps(model, indent=2) + "\n")


if __name__ == "__main__":
    main()
