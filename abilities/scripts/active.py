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
    "ability_unicorn_radiantblast",
    "ability_werewolf_kickflip",
    "ability_werewolf_maulingleap",
    "citadel_ability_healing_slash",
]

TARGETING_LOCATION_VALUE = 'CITADEL_ABILITY_TARGETING_LOCATION_UNIT'

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

def add_passive_item_flag(file_path, output_path=None):
    with open(file_path, 'r') as file:
        content = file.read()

    updated_pieces = []
    changes = 0
    cursor = 0

    for start, end, block in iter_record_spans(content):
        block_modified = False

        if any(name in block for name in ADD_BEHAVIOR_BITS_ABILITIES):
            block, behavior_modified = append_behavior_bits(block, ADD_BEHAVIOR_BITS)
            block_modified = block_modified or behavior_modified

        if any(name in block for name in ADD_BEHAVIOR_BITS_ABILITIES):
            block, targeting_modified = set_targeting_location(block, TARGETING_LOCATION_VALUE)
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
