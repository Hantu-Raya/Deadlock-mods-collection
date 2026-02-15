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

def add_passive_item_flag(file_path, output_path=None):
    with open(file_path, 'r') as file:
        content = file.read()

    blocks = content.split('}\n')
    updated_blocks = []
    changes = 0

    for block in blocks:
        modified = False

        if '_upgrade_' in block and '_multibase' in block:
            matched_remove = next((name for name in REMOVE_FLAG_UPGRADES if name in block), None)
            matched_add = next((name for name in ADD_FLAG_UPGRADES if name in block), None)

            if not matched_remove and 'm_bShowInPassiveItemsArea' not in block:
                # Only apply passive flag addition to allowed upgrades
                if matched_add:
                    block = block.replace(
                        'm_eAbilityActivation = "CITADEL_ABILITY_ACTIVATION_PASSIVE"',
                        'm_eAbilityActivation = "CITADEL_ABILITY_ACTIVATION_PASSIVE"\n            m_bShowInPassiveItemsArea = "true"'
                    )

            # Check if the flag was added (true or "true")
            if re.search(r'm_bShowInPassiveItemsArea\s*=\s*("true"|true)', block):
                modified = True

            # Remove the flag if in REMOVE list
            if matched_remove:
                if 'm_bShowInPassiveItemsArea' in block:
                    block = re.sub(r'\n\s*m_bShowInPassiveItemsArea\s*=\s*("true"|true)', '', block)
                    if not modified:
                        changes += 1
            elif modified:
                changes += 1

        updated_blocks.append(block)

    updated_content = '}\n'.join(updated_blocks)

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
