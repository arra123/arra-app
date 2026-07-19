import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';

import { Assistant } from '@/components/assistant';
import { useWorkspace } from '@/lib/workspace';

export default function ChatTab() {
  const { activeProject, newTask } = useWorkspace();
  useFocusEffect(useCallback(() => {
    if (activeProject) newTask();
  }, [activeProject, newTask]));
  return <Assistant />;
}
