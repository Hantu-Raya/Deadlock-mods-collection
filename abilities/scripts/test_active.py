import contextlib
import io
from pathlib import Path
import tempfile
import unittest

from active import ADD_BEHAVIOR_BITS, TARGETING_LOCATION_VALUE, add_passive_item_flag, get_record_name, iter_record_spans


class ExactAbilityTargetTests(unittest.TestCase):
    """Prefix collisions and nested references must not modify untargeted records.

    Both variants must preserve sibling targeting/behavior and be idempotent.
    """

    def test_only_exact_record_receives_behavior_edits(self):
        records = {
            "citadel_ability_lash": "CITADEL_ABILITY_TARGETING_LOCATION_UNIT",
            "citadel_ability_lash_down_strike": "CITADEL_ABILITY_TARGETING_LOCATION_NONE",
            "citadel_ability_lash_ultimate": "CITADEL_ABILITY_TARGETING_LOCATION_UNIT",
            "unrelated_ability": "CITADEL_ABILITY_TARGETING_LOCATION_NONE",
        }
        bits = " | ".join(ADD_BEHAVIOR_BITS)
        source = "{\n" + "".join(
            f'\t{name} =\n\t{{\n'
            f'\t\tm_AbilityBehaviorsBits = "{bits}"\n'
            f'\t\tm_eAbilityTargetingLocation = "{targeting}"\n'
            '\t\tm_mapDependentAbilities = { reference = "citadel_ability_lash" }\n'
            '\t}\n'
            for name, targeting in records.items()
        ) + "}\n"
        original = {get_record_name(block): block for _, _, block in iter_record_spans(source)}
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "abilities.vdata"
            for enabled in (True, False):
                with self.subTest(enabled=enabled):
                    path.write_text(source)
                    with contextlib.redirect_stdout(io.StringIO()):
                        add_passive_item_flag(path, enable_behavior_bits=enabled)
                    output = path.read_text()
                    changed = {get_record_name(block): block for _, _, block in iter_record_spans(output)}
                    self.assertEqual(set(changed), set(original))
                    for name in records:
                        if name != "citadel_ability_lash":
                            self.assertEqual(changed[name], original[name], name)
                    target = changed["citadel_ability_lash"]
                    for bit in ADD_BEHAVIOR_BITS:
                        self.assertEqual(bit in target, enabled)
                    self.assertEqual(TARGETING_LOCATION_VALUE in target, enabled)
                    with contextlib.redirect_stdout(io.StringIO()):
                        add_passive_item_flag(path, enable_behavior_bits=enabled)
                    self.assertEqual(path.read_text(), output)


if __name__ == "__main__":
    unittest.main()
