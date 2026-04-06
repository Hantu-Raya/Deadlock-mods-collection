#!/usr/bin/env python3
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from active import add_passive_item_flag


"""
Adds or removes m_bShowInPassiveItemsArea = true without behavior-bit injection.
Usage: python active_no_behavior.py <input_file> [output_file]
"""


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python active_no_behavior.py <input_file> [output_file]")
        sys.exit(1)
    inp = sys.argv[1]
    outp = sys.argv[2] if len(sys.argv) > 2 else None
    add_passive_item_flag(inp, outp, enable_behavior_bits=False)
