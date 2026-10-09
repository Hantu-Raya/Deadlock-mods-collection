import contextlib
import io
from pathlib import Path
import tempfile
import unittest

from active import ADD_BEHAVIOR_BITS, ADD_BEHAVIOR_BITS_ABILITIES, CAST_RANGE_SOURCES, CONE_TARGETING_ABILITIES, CONE_SHAPE_VALUE, SHOW_HUD_PANEL_ABILITIES, NO_TARGET_ABILITIES, NO_TARGET_BIT, TARGETING_LOCATION_VALUE, add_passive_item_flag, find_behavior_state_issues, get_record_name, iter_record_spans, read_property_value
from apply_healthbar_status_overrides import apply_healthbar_status_overrides


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


class SelfCastUnitTargetingTests(unittest.TestCase):
    """Stock self-cast abilities given unit targeting must still cast with no enemy in range.

    Failure modes: NO_TARGET missing (cast refused out of range), stock bits or stock
    target types lost, no-behavior variant changing stock, non-idempotent output, and
    verification passing a build that lacks NO_TARGET.
    """

    STOCK_BITS = "CITADEL_ABILITY_BEHAVIOR_SILENT_CAST_FAILURE_FEEDBACK | CITADEL_ABILITY_BEHAVIOR_CHANNELLED"
    STOCK_TYPES = "CITADEL_UNIT_TARGET_HERO_ENEMY | CITADEL_UNIT_TARGET_BOSS_ENEMY | CITADEL_UNIT_TARGET_BUILDING_ENEMY"
    NESTED_TYPES = '\t\t\tm_nAbilityTargetTypes = "CITADEL_UNIT_TARGET_ALL_ENEMY"\n'

    def build_source(self):
        return (
            '{\n\tability_punkgoat_ult =\n\t{\n'
            f'\t\tm_AbilityBehaviorsBits = "{self.STOCK_BITS}"\n'
            '\t\tm_eAbilityTargetingLocation = "CITADEL_ABILITY_TARGETING_LOCATION_SELF"\n'
            '\t\tm_eAbilityActivation = "CITADEL_ABILITY_ACTIVATION_INSTANT_CAST"\n'
            f'\t\tm_nAbilityTargetTypes = "{self.STOCK_TYPES}"\n'
            '\t\tm_Modifier =\n\t\t{\n' + self.NESTED_TYPES + '\t\t}\n'
            '\t}\n}\n'
        )

    def run_transform(self, source, enabled):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "abilities.vdata"
            path.write_text(source)
            with contextlib.redirect_stdout(io.StringIO()):
                add_passive_item_flag(path, enable_behavior_bits=enabled)
            return path.read_text()

    def test_enabled_adds_unit_targeting_with_no_target(self):
        output = self.run_transform(self.build_source(), True)
        self.assertIn(f'm_eAbilityTargetingLocation = "{TARGETING_LOCATION_VALUE}"', output)
        for bit in (*ADD_BEHAVIOR_BITS, NO_TARGET_BIT):
            self.assertIn(bit, output)
        self.assertIn(self.STOCK_BITS, output)
        self.assertEqual(self.run_transform(output, True), output)

    def test_enabled_keeps_stock_target_types(self):
        output = self.run_transform(self.build_source(), True)
        self.assertIn(f'\t\tm_nAbilityTargetTypes = "{self.STOCK_TYPES}"\n', output)
        self.assertIn(self.NESTED_TYPES, output)

    def test_disabled_restores_stock(self):
        source = self.build_source()
        self.assertEqual(self.run_transform(source, False), source)
        enabled = self.run_transform(source, True)
        disabled = self.run_transform(enabled, False)
        self.assertNotIn(NO_TARGET_BIT, disabled)
        self.assertNotIn(TARGETING_LOCATION_VALUE, disabled)

    def test_verification_requires_no_target(self):
        output = self.run_transform(self.build_source(), True).replace(f" | {NO_TARGET_BIT}", "")
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "abilities.vdata"
            path.write_text(output)
            issues = find_behavior_state_issues(path, True)
        self.assertTrue(any(issue.startswith("ability_punkgoat_ult:") for issue in issues), issues)

    def test_no_target_list_matches_stock_baseline(self):
        """A listed ability that gains NO_TARGET upstream would lose it in the no-behavior pak."""
        baseline = Path(__file__).with_name("abilities.vdata").read_text()
        stock = {get_record_name(block): block for _, _, block in iter_record_spans(baseline)}
        for name in NO_TARGET_ABILITIES:
            with self.subTest(name=name):
                self.assertIn(name, ADD_BEHAVIOR_BITS_ABILITIES)
                self.assertNotIn(NO_TARGET_BIT, stock[name])
                self.assertNotIn(f'm_eAbilityTargetingLocation = "{TARGETING_LOCATION_VALUE}"', stock[name])


class ConeTargetingTests(unittest.TestCase):
    """Unit-target UI needs cone shape: the schema says only cone shape drives generic targeting.

    Failure modes: listed ability keeps sphere (no target UI), shape rewritten on an
    unlisted ability or in a nested block, stock cone angle lost, verification passing
    a sphere build, non-idempotent output.
    """

    SPHERE = '\t\tm_eAbilityTargetingShape = "CITADEL_ABILITY_TARGETING_SHAPE_SPHERE"\n'
    NESTED_SHAPE = '\t\t\tm_eAbilityTargetingShape = "CITADEL_ABILITY_TARGETING_SHAPE_SPHERE"\n'

    def record(self, name):
        return (
            f'\t{name} =\n\t{{\n'
            '\t\tm_AbilityBehaviorsBits = "CITADEL_ABILITY_BEHAVIOR_MOVEMENT"\n'
            '\t\tm_eAbilityTargetingLocation = "CITADEL_ABILITY_TARGETING_LOCATION_SELF"\n'
            + self.SPHERE +
            '\t\tm_flTargetingConeAngle = 35.0\n'
            '\t\tm_Nested =\n\t\t{\n' + self.NESTED_SHAPE + '\t\t}\n'
            '\t}\n'
        )

    def run_transform(self, source, enabled=True):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "abilities.vdata"
            path.write_text(source)
            with contextlib.redirect_stdout(io.StringIO()):
                add_passive_item_flag(path, enable_behavior_bits=enabled)
            return path.read_text()

    def test_listed_abilities_get_cone_shape_only_at_top_level(self):
        unlisted = "ability_punkgoat_ult"
        source = "{\n" + self.record("ability_werewolf_kickflip") + self.record(unlisted) + "}\n"
        output = self.run_transform(source)
        blocks = {get_record_name(block): block for _, _, block in iter_record_spans(output)}
        kick = blocks["ability_werewolf_kickflip"]
        self.assertIn(f'\t\tm_eAbilityTargetingShape = "{CONE_SHAPE_VALUE}"\n', kick)
        self.assertNotRegex(kick, r'(?m)^\t\tm_eAbilityTargetingShape = "CITADEL_ABILITY_TARGETING_SHAPE_SPHERE"')
        self.assertIn(self.NESTED_SHAPE, kick)
        self.assertIn("m_flTargetingConeAngle = 35.0", kick)
        self.assertRegex(blocks[unlisted], r'(?m)^\t\tm_eAbilityTargetingShape = "CITADEL_ABILITY_TARGETING_SHAPE_SPHERE"')
        self.assertEqual(self.run_transform(output), output)
        self.assertEqual(self.run_transform(source, enabled=False), source)

    def test_verification_requires_cone_shape(self):
        output = self.run_transform("{\n" + self.record("ability_werewolf_kickflip") + "}\n")
        output = output.replace(f'\t\tm_eAbilityTargetingShape = "{CONE_SHAPE_VALUE}"\n', self.SPHERE)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "abilities.vdata"
            path.write_text(output)
            issues = find_behavior_state_issues(path, True)
        self.assertTrue(any(issue.startswith("ability_werewolf_kickflip:") for issue in issues), issues)

    def test_cone_list_is_listed_and_has_stock_cone_angle(self):
        baseline = Path(__file__).with_name("abilities.vdata").read_text()
        stock = {get_record_name(block): block for _, _, block in iter_record_spans(baseline)}
        for name in CONE_TARGETING_ABILITIES:
            with self.subTest(name=name):
                self.assertIn(name, ADD_BEHAVIOR_BITS_ABILITIES)
                self.assertRegex(stock[name], r'(?m)^\t\tm_flTargetingConeAngle\s*=')


class HudPanelTests(unittest.TestCase):
    """The unit-target UI is an ability HUD element; m_bForceHideHUDPanel = true hides it.

    Failure modes: listed ability keeps the forced hide, an unlisted ability or a nested
    block loses it, verification passing a hidden build, non-idempotent output.
    """

    HIDE = '\t\tm_bForceHideHUDPanel = true\n'
    SHOW = '\t\tm_bForceHideHUDPanel = false\n'

    def record(self, name):
        return (
            f'\t{name} =\n\t{{\n'
            '\t\tm_AbilityBehaviorsBits = "CITADEL_ABILITY_BEHAVIOR_MOVEMENT"\n'
            '\t\tm_eAbilityTargetingLocation = "CITADEL_ABILITY_TARGETING_LOCATION_SELF"\n'
            '\t\tm_eAbilityTargetingShape = "CITADEL_ABILITY_TARGETING_SHAPE_SPHERE"\n'
            + self.HIDE +
            '\t\tm_Nested =\n\t\t{\n\t\t\tm_bForceHideHUDPanel = true\n\t\t}\n'
            '\t}\n'
        )

    def run_transform(self, source, enabled=True):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "abilities.vdata"
            path.write_text(source)
            with contextlib.redirect_stdout(io.StringIO()):
                add_passive_item_flag(path, enable_behavior_bits=enabled)
            return path.read_text()

    def test_listed_ability_shows_hud_panel(self):
        unlisted = "ability_punkgoat_ult"
        source = "{\n" + self.record("ability_werewolf_kickflip") + self.record(unlisted) + "}\n"
        output = self.run_transform(source)
        blocks = {get_record_name(block): block for _, _, block in iter_record_spans(output)}
        kick = blocks["ability_werewolf_kickflip"]
        self.assertRegex(kick, r'(?m)^\t\tm_bForceHideHUDPanel = false$')
        self.assertRegex(kick, r'(?m)^\t\t\tm_bForceHideHUDPanel = true$')
        self.assertRegex(blocks[unlisted], r'(?m)^\t\tm_bForceHideHUDPanel = true$')
        self.assertEqual(self.run_transform(output), output)
        self.assertEqual(self.run_transform(source, enabled=False), source)

    def test_verification_requires_visible_hud_panel(self):
        output = self.run_transform("{\n" + self.record("ability_werewolf_kickflip") + "}\n").replace(self.SHOW, self.HIDE)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "abilities.vdata"
            path.write_text(output)
            issues = find_behavior_state_issues(path, True)
        self.assertTrue(any(issue == "ability_werewolf_kickflip: HUD panel still force-hidden" for issue in issues), issues)

    def test_hud_list_is_listed_and_stock_hidden(self):
        baseline = Path(__file__).with_name("abilities.vdata").read_text()
        stock = {get_record_name(block): block for _, _, block in iter_record_spans(baseline)}
        for name in SHOW_HUD_PANEL_ABILITIES:
            with self.subTest(name=name):
                self.assertIn(name, ADD_BEHAVIOR_BITS_ABILITIES)
                self.assertRegex(stock[name], r'(?m)^\t\tm_bForceHideHUDPanel = true$')


class CastRangeTests(unittest.TestCase):
    """Cone targeting reaches only AbilityCastRange; a stock range of 0 finds no target.

    Failure modes: listed ability keeps range 0 (no target UI), the source property or
    an unlisted ability changes, a nonzero stock range is overwritten, verification
    passing a zero-range build, non-idempotent output.
    """

    def record(self, name, cast_range="0"):
        return (
            f'\t{name} =\n\t{{\n'
            '\t\tm_AbilityBehaviorsBits = "CITADEL_ABILITY_BEHAVIOR_DISPLAYS_DAMAGE_IMPACT"\n'
            '\t\tm_eAbilityTargetingLocation = "CITADEL_ABILITY_TARGETING_LOCATION_SELF"\n'
            '\t\tm_eAbilityTargetingShape = "CITADEL_ABILITY_TARGETING_SHAPE_SPHERE"\n'
            '\t\tm_mapAbilityProperties = \n\t\t{\n'
            '\t\t\tAbilityCastRange = \n\t\t\t{\n'
            f'\t\t\t\tm_strValue = "{cast_range}"\n'
            '\t\t\t\tm_eDisplayUnits = "EDisplayUnit_Meters"\n'
            '\t\t\t}\n'
            '\t\t\tSlashRadius = \n\t\t\t{\n'
            '\t\t\t\tm_strValue = "10m"\n'
            '\t\t\t}\n'
            '\t\t}\n'
            '\t}\n'
        )

    def run_transform(self, source, enabled=True):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "abilities.vdata"
            path.write_text(source)
            with contextlib.redirect_stdout(io.StringIO()):
                add_passive_item_flag(path, enable_behavior_bits=enabled)
            return path.read_text()

    def test_listed_ability_gets_cast_range_from_source_property(self):
        unlisted = "ability_punkgoat_ult"
        source = "{\n" + self.record("ability_werewolf_cripplingslash") + self.record(unlisted) + "}\n"
        output = self.run_transform(source)
        blocks = {get_record_name(block): block for _, _, block in iter_record_spans(output)}
        slash = blocks["ability_werewolf_cripplingslash"]
        self.assertEqual(read_property_value(slash, "AbilityCastRange"), "10m")
        self.assertEqual(read_property_value(slash, "SlashRadius"), "10m")
        self.assertEqual(read_property_value(blocks[unlisted], "AbilityCastRange"), "0")
        self.assertEqual(self.run_transform(output), output)
        self.assertEqual(self.run_transform(source, enabled=False), source)

    def test_nonzero_stock_range_is_kept(self):
        output = self.run_transform("{\n" + self.record("ability_werewolf_cripplingslash", "4m") + "}\n")
        self.assertEqual(read_property_value(output, "AbilityCastRange"), "4m")

    def test_verification_requires_cast_range(self):
        output = self.run_transform("{\n" + self.record("ability_werewolf_cripplingslash") + "}\n")
        output = output.replace('m_strValue = "10m"\n\t\t\t\tm_eDisplayUnits', 'm_strValue = "0"\n\t\t\t\tm_eDisplayUnits')
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "abilities.vdata"
            path.write_text(output)
            issues = find_behavior_state_issues(path, True)
        self.assertIn("ability_werewolf_cripplingslash: cast range still 0", issues)

    def test_cast_range_sources_match_stock_baseline(self):
        baseline = Path(__file__).with_name("abilities.vdata").read_text()
        stock = {get_record_name(block): block for _, _, block in iter_record_spans(baseline)}
        for name, source_property in CAST_RANGE_SOURCES.items():
            with self.subTest(name=name):
                self.assertIn(name, ADD_BEHAVIOR_BITS_ABILITIES)
                self.assertEqual(read_property_value(stock[name], "AbilityCastRange"), "0")
                self.assertNotIn(read_property_value(stock[name], source_property), (None, "0"))


class HealthbarStatusTests(unittest.TestCase):
    """New barriers need visibility; explicit policies and unknown-record rejection must survive."""

    def test_baba_barrier_visibility_preserves_explicit_statuses(self):
        source = (
            '{\n\tability_baba_hexing_brew =\n\t{\n'
            '\t\tm_BarrierModifier = subclass:\n\t\t{\n'
            '\t\t\t_my_subclass_name = "modifier_baba_brew_barrier"\n'
            '\t\t\tm_eModifierDisplayLocaiton = "MODIFIER_DISPLAY_HEALTHBAR"\n'
            '\t\t}\n'
            '\t\tm_FireModifier = subclass:\n\t\t{\n'
            '\t\t\tm_eDrawOverheadStatus = "OVERHEAD_DRAW_FOR_CASTER_ONLY"\n'
            '\t\t\tm_eModifierDisplayLocaiton = "MODIFIER_DISPLAY_HEALTHBAR"\n'
            '\t\t}\n\t}\n}\n'
        )
        updated, changes = apply_healthbar_status_overrides(source, require_special_records=False)
        self.assertEqual(changes, 1)
        self.assertEqual(updated.count('m_eDrawOverheadStatus = "OVERHEAD_DRAW_FOR_EVERYONE"'), 1)
        self.assertEqual(updated.count('m_eDrawOverheadStatus = "OVERHEAD_DRAW_FOR_CASTER_ONLY"'), 1)
        self.assertEqual(apply_healthbar_status_overrides(updated, require_special_records=False), (updated, 0))
        with self.assertRaisesRegex(ValueError, "Unclassified healthbar modifier"):
            apply_healthbar_status_overrides(
                source.replace("ability_baba_hexing_brew", "unknown_ability"),
                require_special_records=False,
            )


if __name__ == "__main__":
    unittest.main()
