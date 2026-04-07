import { useEffect } from 'react';
import { useClaraAssistant } from '../context/ClaraAssistantContext';
import { claraToast } from '../utils/claraToast';

/**
 * Invisible component that wires up claraToast with the Clara context.
 * Mount once inside ClaraAssistantProvider.
 */
export default function ClaraToastInit() {
  const { openClara } = useClaraAssistant();

  useEffect(() => {
    claraToast.init(openClara);
  }, [openClara]);

  return null;
}
