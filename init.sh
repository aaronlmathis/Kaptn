#!/bin/bash
# init.sh: Sets permissions, creates a symbolic link, and reloads the iwlwifi module.
# This script is executed via the InitAction in the .inf file.

# 1. Define the necessary files (PNVM and UCODE)
PNVM_FILE="/custom/lib/firmware/iwlwifi-bz-b0-gf-a0.pnvm"
UCODE_FILE="/custom/lib/firmware/iwlwifi-bz-b0-gf-a0-92.ucode"

# 2. Set Permissions (Essential for -2 error)
# Set files to 644 (readable by everyone, writable by owner/root)
chmod 644 "$PNVM_FILE"
chmod 644 "$UCODE_FILE"

# 3. Create the Symbolic Link via Bind Mount (Fixes 'File not found' error)
# This forces the kernel's native search path (/lib/firmware) to include the
# contents of your Custom Partition firmware folder (/custom/lib/firmware).
# The link will be created in the read-only /lib/firmware, but pointing to /custom.
# We first try the recommended bind mount method for flexibility.

if [ -d "/custom/lib/firmware" ]; then
    # Create the symbolic link from the kernel's search path to your file location.
    # The kernel will follow the 'custom-cp' link inside its /lib/firmware search.
    # We use -sf for force/silent link creation.
    ln -sf /custom/lib/firmware /lib/firmware/custom-cp
fi

# 4. Attempt to remove/reload the module (Forces the kernel to notice new files)
# This clears any previous failed state and makes the kernel look again.
/sbin/modprobe -r iwlwifi
/sbin/modprobe iwlwifi

exit 0