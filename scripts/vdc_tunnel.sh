#!/bin/bash
# Pull and execute the latest tunnel-setup script straight from VDC.
# The ?app= parameter tells VDC which Application's tunnel port to use
# so multiple Emergent pods don't fight over the same port.
curl -sSL -H "X-API-Key: clara_msMDkSh_mTioXzCDYDljLYuEyzHdIkpgMDdyPiWllFM" \
  "https://vdc.koodh.com/api/clara/tunnel-setup-script?app=14a84e6e-e0d7-4169-917c-bbb15594e046&raw=1" | bash
