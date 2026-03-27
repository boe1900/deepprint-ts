import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api-client';

type ChatSeedMessage = { id?: string; role: string; parts: unknown[] };

interface UseActiveTemplateStateParams {
  defaultCode: string;
  defaultData: Record<string, unknown>;
}

export function useActiveTemplateState({
  defaultCode,
  defaultData,
}: UseActiveTemplateStateParams) {
  const [activeTemplateId, setActiveTemplateId] = useState('');
  const [code, setCode] = useState(defaultCode);
  const [data, setData] = useState<Record<string, unknown>>(defaultData);
  const [chatSeedMessages, setChatSeedMessages] = useState<ChatSeedMessage[]>([]);
  const [chatSeedVersion, setChatSeedVersion] = useState(0);
  const selectTemplateSeqRef = useRef(0);
  const currentTemplateIdRef = useRef('');

  useEffect(() => {
    currentTemplateIdRef.current = activeTemplateId;
  }, [activeTemplateId]);

  const resetActiveTemplate = useCallback(() => {
    selectTemplateSeqRef.current += 1;
    currentTemplateIdRef.current = '';
    setActiveTemplateId('');
    setCode(defaultCode);
    setData(defaultData);
    setChatSeedMessages([]);
    setChatSeedVersion((version) => version + 1);
  }, [defaultCode, defaultData]);

  const selectTemplate = useCallback(async (id: string) => {
    const seq = ++selectTemplateSeqRef.current;
    currentTemplateIdRef.current = id;
    setActiveTemplateId(id);
    setChatSeedMessages([]);
    setChatSeedVersion((version) => version + 1);

    try {
      const [detail, thread] = await Promise.all([
        api.getTemplate(id),
        api.getTemplateAiThread(id),
      ]);

      if (selectTemplateSeqRef.current !== seq || currentTemplateIdRef.current !== id) {
        return;
      }

      setCode(detail.content || defaultCode);
      setData(detail.mock_data && Object.keys(detail.mock_data).length > 0 ? detail.mock_data : defaultData);
      setChatSeedMessages(thread.messages.map((message) => ({
        id: message.id,
        role: message.role,
        parts: message.parts || [],
      })));
      setChatSeedVersion((version) => version + 1);
    } catch (err) {
      if (selectTemplateSeqRef.current !== seq || currentTemplateIdRef.current !== id) {
        return;
      }

      console.error('加载模版失败:', err);
      setChatSeedMessages([]);
      setChatSeedVersion((version) => version + 1);
    }
  }, [defaultCode, defaultData]);

  return {
    activeTemplateId,
    chatSeedMessages,
    chatSeedVersion,
    code,
    data,
    hasActiveTemplate: !!activeTemplateId,
    resetActiveTemplate,
    selectTemplate,
    setCode,
    setData,
  };
}
