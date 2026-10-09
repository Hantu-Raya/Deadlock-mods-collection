#!/usr/bin/env python3
import sys
import re

"""
Adds or removes m_bShowInPassiveItemsArea = true depending on block context.
Usage: python insert_line.py <input_file> [output_file]
"""

# List of upgrade names to remove the flag from
REMOVE_FLAG_UPGRADES = [
    "upgrade_spellslinger_headshots",
    "upgrade_regenerating_bullet_shield",
    "upgrade_magic_shield",
    "upgrade_arcane_surge",
    "upgrade_kinetic_sash",
    "upgrade_chonky",
    "upgrade_critshot",
    "upgrade_close_quarter_combat",
    "upgrade_ultimate_burst",
    "upgrade_non_player_bonus_sacrifice",
    "upgrade_headshot_booster2",
    "upgrade_bulletshredimbue",
]

# List of upgrade names to force-add the flag to
ADD_FLAG_UPGRADES = [
    "upgrade_spirit_bubble",
    "upgrade_weapon_shielding",
    "upgrade_spellbreaker",
    "upgrade_spirit_burn",
    "upgrade_resonant_healing",
    "upgrade_weapon_backstabber",
    "upgrade_rechargingbullets",
    "upgrade_auto_cleanse",
]

# Behavior bits to inject into abilities listed below.
ADD_BEHAVIOR_BITS = (
    "CITADEL_ABILITY_BEHAVIOR_USE_INSTANT_CAST_UNIT_TARGET_UI",
    "CITADEL_ABILITY_BEHAVIOR_CAN_SET_QUICK_CAST",
)

# Add more ability names here to receive ADD_BEHAVIOR_BITS.
ADD_BEHAVIOR_BITS_ABILITIES = [
    "ability_vampirebat_steallife",
    "citadel_ability_chrono_swap",
    "citadel_ability_shiv_killing_blow",
    "citadel_ability_hook",
    "citadel_ability_lash",
    "ability_lash_flog",
    "ability_unicorn_radiantblast",
    "ability_werewolf_kickflip",
    "ability_werewolf_maulingleap",
    "ability_werewolf_frenzy",
    "ability_werewolf_cripplingslash",
    "citadel_ability_healing_slash",
    "ability_punkgoat_tether",
    "ability_punkgoat_ult",
]

# Listed abilities whose stock targeting is not UNIT (SELF, NONE or absent) and whose
# stock bits lack NO_TARGET. Forced unit targeting alone refuses the cast without an
# enemy in range; NO_TARGET keeps it castable anywhere, the same pairing stock
# unit-targeted cone/AoE abilities (radiant blast, steal life) use.
# Only list abilities whose stock bits lack NO_TARGET: the no-behavior variant removes it.
NO_TARGET_BIT = "CITADEL_ABILITY_BEHAVIOR_NO_TARGET"
NO_TARGET_ABILITIES = (
    "ability_punkgoat_tether",
    "ability_punkgoat_ult",
    "ability_werewolf_kickflip",
    "ability_werewolf_maulingleap",
    "ability_werewolf_cripplingslash",
    "citadel_ability_hook",
    "citadel_ability_chrono_swap",
    "citadel_ability_shiv_killing_blow",
)

TARGETING_LOCATION_VALUE = 'CITADEL_ABILITY_TARGETING_LOCATION_UNIT'

# Listed abilities that still show no unit-target UI with a sphere shape. The ability
# VData schema says only cone shape drives the generic targeting; other shapes are
# preview-only and leave targeting to the ability's own code. These records already
# carry stock m_flTargetingConeAngle/HalfWidth values, which the cone then uses.
CONE_SHAPE_VALUE = 'CITADEL_ABILITY_TARGETING_SHAPE_CONE'
CONE_TARGETING_ABILITIES = (
    "ability_punkgoat_tether",
    "ability_werewolf_kickflip",
    "ability_werewolf_maulingleap",
    "ability_werewolf_cripplingslash",
)
TARGETING_SHAPE_PATTERN = re.compile(r'(?m)^(\t\tm_eAbilityTargetingShape\s*=\s*")([^"]*)(")')

def behavior_bits_for(record_name):
    return ADD_BEHAVIOR_BITS + ((NO_TARGET_BIT,) if record_name in NO_TARGET_ABILITIES else ())

def set_cone_shape(block):
    match = TARGETING_SHAPE_PATTERN.search(block)
    if not match or match.group(2) == CONE_SHAPE_VALUE:
        return block, False
    return block[:match.start(2)] + CONE_SHAPE_VALUE + block[match.end(2):], True

def has_cone_shape(block):
    match = TARGETING_SHAPE_PATTERN.search(block)
    return bool(match) and match.group(2) == CONE_SHAPE_VALUE

# The unit-target UI is an ability HUD element (ability_hud_element_unit_target), and
# stock m_bForceHideHUDPanel = true hides the whole ability HUD panel. Unhide it for
# listed abilities that still show no target UI.
SHOW_HUD_PANEL_ABILITIES = (
    "ability_werewolf_kickflip",
    "ability_werewolf_maulingleap",
)
FORCE_HIDE_HUD_PATTERN = re.compile(r'(?m)^(\t\tm_bForceHideHUDPanel\s*=\s*)true$')

def show_hud_panel(block):
    updated, count = FORCE_HIDE_HUD_PATTERN.subn(r'\1false', block, count=1)
    return updated, bool(count)

# Cone targeting only reaches AbilityCastRange. Listed abilities with a stock range of 0
# (their own code uses another radius) get that property's value, so the cone finds
# targets. Maps ability -> property whose m_strValue becomes the cast range.
CAST_RANGE_SOURCES = {
    "ability_werewolf_cripplingslash": "SlashRadius",
}

def property_value_pattern(name):
    return re.compile(rf'(?m)^(\t\t\t{name}\s*=\s*\n\t\t\t\{{\n\t\t\t\tm_strValue\s*=\s*")([^"]*)(")')

def read_property_value(block, name):
    match = property_value_pattern(name).search(block)
    return match.group(2) if match else None

def set_cast_range_from(block, source_property):
    source_value = read_property_value(block, source_property)
    match = property_value_pattern("AbilityCastRange").search(block)
    if not match or match.group(2) != "0" or source_value in (None, "0"):
        return block, False
    return block[:match.start(2)] + source_value + block[match.end(2):], True

def append_behavior_bits(block, extra_bits):
    match = re.search(
        r'(?m)^(\s*m_AbilityBehaviorsBits\s*=\s*")([^"]*)("\s*)$',
        block,
    )
    if not match:
        return block, False

    current_bits = match.group(2)
    updated_bits = current_bits

    for bit in extra_bits:
        if bit not in current_bits:
            if updated_bits:
                updated_bits += f" | {bit}"
            else:
                updated_bits = bit

    if updated_bits == current_bits:
        return block, False

    replacement = f"{match.group(1)}{updated_bits}{match.group(3)}"
    return block[:match.start()] + replacement + block[match.end():], True

def remove_behavior_bits(block, extra_bits):
    match = re.search(
        r'(?m)^(\s*m_AbilityBehaviorsBits\s*=\s*")([^"]*)("\s*)$',
        block,
    )
    if not match:
        return block, False

    current_bits = [part.strip() for part in match.group(2).split('|') if part.strip()]
    updated_bits = [bit for bit in current_bits if bit not in extra_bits]

    if updated_bits == current_bits:
        return block, False

    replacement_bits = " | ".join(updated_bits)
    replacement = f"{match.group(1)}{replacement_bits}{match.group(3)}"
    return block[:match.start()] + replacement + block[match.end():], True

def set_targeting_location(block, targeting_value):
    match = re.search(
        r'(?m)^(\s*m_eAbilityTargetingLocation\s*=\s*")([^"]*)("\s*)$',
        block,
    )
    if not match:
        activation_match = re.search(
            r'(?m)^(\s*m_eAbilityActivation\s*=\s*".*?"\s*)$',
            block,
        )
        if activation_match:
            indent_match = re.match(r'^(\s*)', activation_match.group(1))
            indent = indent_match.group(1) if indent_match else ''
            insertion = f'\n{indent}m_eAbilityTargetingLocation = "{targeting_value}"'
            insert_at = activation_match.end(1)
            return block[:insert_at] + insertion + block[insert_at:], True

        behaviors_match = re.search(
            r'(?m)^(\s*m_AbilityBehaviorsBits\s*=\s*".*?"\s*)$',
            block,
        )
        if behaviors_match:
            indent_match = re.match(r'^(\s*)', behaviors_match.group(1))
            indent = indent_match.group(1) if indent_match else ''
            insertion = f'\n{indent}m_eAbilityTargetingLocation = "{targeting_value}"'
            insert_at = behaviors_match.start(1)
            return block[:insert_at] + insertion + block[insert_at:], True

        return block, False

    if match.group(2) == targeting_value:
        return block, False

    replacement = f'{match.group(1)}{targeting_value}{match.group(3)}'
    return block[:match.start()] + replacement + block[match.end():], True

def remove_targeting_location(block, targeting_value):
    match = re.search(
        r'(?m)^(\s*m_eAbilityTargetingLocation\s*=\s*")([^"]*)("\s*)$',
        block,
    )
    if not match or match.group(2) != targeting_value:
        return block, False

    return block[:match.start()] + block[match.end():], True

def get_record_name(block):
    match = re.match(r'^[ \t]([A-Za-z0-9_]+)\s*=\s*(?:\r?\n)', block)
    return match.group(1) if match else None

def find_behavior_state_issues(file_path, expect_enabled):
    with open(file_path, 'r') as file:
        content = file.read()

    expected_names = set(ADD_BEHAVIOR_BITS_ABILITIES)
    found_names = set()
    issues = []
    expected_targeting = f'm_eAbilityTargetingLocation = "{TARGETING_LOCATION_VALUE}"'

    for _, _, block in iter_record_spans(content):
        record_name = get_record_name(block)
        if record_name not in expected_names:
            continue

        found_names.add(record_name)
        bits = behavior_bits_for(record_name)
        has_all_bits = all(bit in block for bit in bits)
        has_any_bit = any(bit in block for bit in bits)
        has_targeting = expected_targeting in block
        needs_cone = record_name in CONE_TARGETING_ABILITIES

        if expect_enabled and (not has_all_bits or not has_targeting):
            issues.append(f"{record_name}: missing behavior bits or unit targeting")

        if expect_enabled and needs_cone and not has_cone_shape(block):
            issues.append(f"{record_name}: missing cone targeting shape")

        if expect_enabled and record_name in SHOW_HUD_PANEL_ABILITIES and FORCE_HIDE_HUD_PATTERN.search(block):
            issues.append(f"{record_name}: HUD panel still force-hidden")

        if expect_enabled and record_name in CAST_RANGE_SOURCES and read_property_value(block, "AbilityCastRange") in (None, "0"):
            issues.append(f"{record_name}: cast range still 0")

        if not expect_enabled and (has_any_bit or has_targeting):
            issues.append(f"{record_name}: behavior bits or unit targeting still present")

    for missing_name in sorted(expected_names - found_names):
        issues.append(f"{missing_name}: target ability block not found")

    return issues

def verify_behavior_state(file_path, expect_enabled=True):
    issues = find_behavior_state_issues(file_path, expect_enabled)
    state_name = "enabled" if expect_enabled else "disabled"

    if issues:
        print(f"Behavior state verification failed for {file_path} ({state_name}):")
        for issue in issues:
            print(f"  - {issue}")
        return False

    print(f"Behavior state verification passed for {file_path} ({state_name})")
    return True

def iter_record_spans(content):
    lines = content.splitlines(keepends=True)
    header_pattern = re.compile(r'^[ \t][A-Za-z0-9_]+\s*=\s*$')
    depth = 0
    index = 0
    offset = 0
    block_start = None
    block_depth = 0

    while index < len(lines):
        line = lines[index]
        line_end = offset + len(line)

        if block_start is None and depth == 1 and header_pattern.match(line.rstrip('\r\n')):
            block_start = offset
            block_depth = depth

        if block_start is not None:
            block_depth += line.count('{') - line.count('}')
            if block_depth == 1 and line.lstrip().startswith('}'):
                yield block_start, line_end, content[block_start:line_end]
                block_start = None
            depth = block_depth
        else:
            depth += line.count('{') - line.count('}')

        index += 1
        offset = line_end

    if block_start is not None:
        yield block_start, len(content), content[block_start:]

def add_passive_item_flag(file_path, output_path=None, enable_behavior_bits=True):
    with open(file_path, 'r') as file:
        content = file.read()

    updated_pieces = []
    changes = 0
    cursor = 0

    for start, end, block in iter_record_spans(content):
        block_modified = False

        record_name = get_record_name(block)
        if record_name in ADD_BEHAVIOR_BITS_ABILITIES:
            bits = behavior_bits_for(record_name)
            if enable_behavior_bits:
                block, behavior_modified = append_behavior_bits(block, bits)
                block_modified = block_modified or behavior_modified

                block, targeting_modified = set_targeting_location(block, TARGETING_LOCATION_VALUE)
                block_modified = block_modified or targeting_modified

                if record_name in CONE_TARGETING_ABILITIES:
                    block, shape_modified = set_cone_shape(block)
                    block_modified = block_modified or shape_modified

                if record_name in SHOW_HUD_PANEL_ABILITIES:
                    block, hud_modified = show_hud_panel(block)
                    block_modified = block_modified or hud_modified

                if record_name in CAST_RANGE_SOURCES:
                    block, range_modified = set_cast_range_from(block, CAST_RANGE_SOURCES[record_name])
                    block_modified = block_modified or range_modified
            else:
                block, behavior_modified = remove_behavior_bits(block, bits)
                block_modified = block_modified or behavior_modified

                block, targeting_modified = remove_targeting_location(block, TARGETING_LOCATION_VALUE)
                block_modified = block_modified or targeting_modified

        if '_upgrade_' in block and '_multibase' in block:
            matched_remove = next((name for name in REMOVE_FLAG_UPGRADES if name in block), None)
            matched_add = next((name for name in ADD_FLAG_UPGRADES if name in block), None)

            if not matched_remove and 'm_bShowInPassiveItemsArea' not in block:
                block = block.replace(
                    'm_eAbilityActivation = "CITADEL_ABILITY_ACTIVATION_INSTANT_CAST"',
                    'm_eAbilityActivation = "CITADEL_ABILITY_ACTIVATION_INSTANT_CAST"\n            m_bShowInPassiveItemsArea = "true"'
                )
                block = block.replace(
                    'm_eAbilityActivation = "CITADEL_ABILITY_ACTIVATION_PRESS"',
                    'm_eAbilityActivation = "CITADEL_ABILITY_ACTIVATION_PRESS"\n            m_bShowInPassiveItemsArea = "true"'
                )
                block_modified = True
                # Only apply passive flag addition to allowed upgrades
                if matched_add:
                    block = block.replace(
                        'm_eAbilityActivation = "CITADEL_ABILITY_ACTIVATION_PASSIVE"',
                        'm_eAbilityActivation = "CITADEL_ABILITY_ACTIVATION_PASSIVE"\n            m_bShowInPassiveItemsArea = "true"'
                    )
                    block_modified = True

            # Remove the flag if in REMOVE list
            if matched_remove:
                if 'm_bShowInPassiveItemsArea' in block:
                    block = re.sub(r'\n\s*m_bShowInPassiveItemsArea\s*=\s*("true"|true)', '', block)
                    block_modified = True

        if block_modified:
            changes += 1

        updated_pieces.append(content[cursor:start])
        updated_pieces.append(block)
        cursor = end

    updated_pieces.append(content[cursor:])
    updated_content = ''.join(updated_pieces)

    target = output_path or file_path
    with open(target, 'w') as out_file:
        out_file.write(updated_content)

    print(f"Update completed: {changes} block(s) modified. Output -> {target}")


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python insert_line.py <input_file> [output_file]")
        sys.exit(1)
    inp = sys.argv[1]
    outp = sys.argv[2] if len(sys.argv) > 2 else None
    add_passive_item_flag(inp, outp)
