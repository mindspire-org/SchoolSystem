import React, { useEffect, useMemo, useState } from 'react';
import { Box, Button, Card, CardBody, Flex, Heading, HStack, Input, InputGroup, InputLeftAddon, Select, Text, Textarea, useToast, VStack, Avatar, Divider } from '@chakra-ui/react';
import { MdArrowBack } from 'react-icons/md';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { parentsApi, campusesApi } from '../../../../services/api';
import { http } from '../../../../services/http';
import { useAuth } from '../../../../contexts/AuthContext';

export default function ParentInform() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { campusId } = useAuth();
  const [parentId, setParentId] = useState(params.get('parentId') || '');
  const [parents, setParents] = useState([]);
  const [children, setChildren] = useState([]);
  const [childId, setChildId] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [toPhone, setToPhone] = useState('');
  const [selectedParent, setSelectedParent] = useState(null);
  const [channel, setChannel] = useState('whatsapp'); // 'whatsapp' | 'sms' | 'whatsapp-web'
  const [messages, setMessages] = useState([]);
  const [poller, setPoller] = useState(null);
  const [historyEnabled, setHistoryEnabled] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await parentsApi.list({ pageSize: 200 });
        const rows = data?.rows || data?.items || [];
        setParents(rows);
        if (parentId) {
          const p = rows.find((r) => String(r.id) === String(parentId));
          if (p) {
            const pd = await parentsApi.getById(p.id);
            const kids = pd?.children || [];
            setChildren(kids);
            setSelectedParent(pd || null);
            // If only one child, auto-select and use its parentPhone when available
            if (kids.length === 1) {
              setChildId(String(kids[0].id));
              setToPhone(kids[0]?.parentPhone || pd?.whatsappPhone || '');
            } else {
              const firstPhone = kids.find((c) => c?.parentPhone)?.parentPhone;
              setToPhone(firstPhone || pd?.whatsappPhone || '');
            }
          }
        }
      } catch (_) { }
    };
    load();
  }, [parentId]);

  useEffect(() => {
    if (!parentId) return;
    let active = true;
    const loadMessages = async () => {
      try {
        const res = await parentsApi.messages(parentId, { pageSize: 200 });
        const items = res?.items || res?.rows || [];
        if (active) setMessages(items);
      } catch (e) {
        // If backend doesn't support messages endpoint, stop polling
        if (active) {
          setHistoryEnabled(false);
        }
        clearInterval(id);
      }
    };
    loadMessages();
    const id = setInterval(loadMessages, 5000);
    setPoller(id);
    return () => {
      active = false;
      if (id) clearInterval(id);
    };
  }, [parentId]);

  useEffect(() => {
    if (!selectedParent) return;
    let phone = '';
    if (childId) {
      const kid = (children || []).find((c) => String(c.id) === String(childId));
      phone = kid?.parentPhone || '';
    }
    if (!phone) {
      const firstPhone = (children || []).find((c) => c?.parentPhone)?.parentPhone;
      phone = firstPhone || selectedParent?.whatsappPhone || '';
    }
    setToPhone(phone || '');
  }, [selectedParent, children, childId]);

  const onParentChange = async (id) => {
    setParentId(id);
    setChildId('');
    try {
      if (!id) { setChildren([]); return; }
      const data = await parentsApi.getById(id);
      const kids = data?.children || [];
      setChildren(kids);
      setSelectedParent(data || null);
      if (kids.length === 1) {
        setChildId(String(kids[0].id));
        setToPhone(kids[0]?.parentPhone || data?.whatsappPhone || '');
      } else {
        const firstPhone = kids.find((c) => c?.parentPhone)?.parentPhone;
        setToPhone(firstPhone || data?.whatsappPhone || '');
      }
    } catch (_) { }
  };

  const onChildChange = (val) => {
    setChildId(val);
    const kid = (children || []).find((c) => String(c.id) === String(val));
    if (kid && kid.parentPhone) {
      setToPhone(kid.parentPhone);
    }
  };

  const handleSend = async () => {
    if (channel === 'whatsapp-web') {
      await handleSendWeb();
      return;
    }
    if (!message.trim()) {
      toast({ title: 'Message is required', status: 'warning' });
      return;
    }
    try {
      setLoading(true);
      const payload = { childId: childId || null, message, channel };
      if (toPhone) payload.toPhone = toPhone;
      const resp = await parentsApi.inform(parentId || '0', payload);
      const via = resp?.via || (channel === 'sms' ? 'twilio:sms' : 'twilio:whatsapp');
      if (resp?.delivered) {
        const note = channel === 'whatsapp' && via === 'twilio:sms' ? ' (fallback to SMS)' : '';
        toast({ title: 'Message queued', description: `Sent via ${via}${note}.`, status: 'success' });
      } else {
        const errMsg = resp?.error || 'Message not delivered. Check Twilio configuration or number.';
        toast({ title: 'Not delivered', description: errMsg, status: 'warning' });
      }
      // optimistic add to chat
      setMessages((prev) => [...prev, {
        id: Date.now(),
        parentId: Number(parentId),
        childId: childId ? Number(childId) : null,
        to: toPhone,
        from: null,
        channel: via,
        direction: 'outbound',
        body: message,
        status: resp?.delivered ? 'sent' : 'queued',
        createdAt: new Date().toISOString()
      }]);
      setMessage('');
    } catch (e) {
      const msg = e?.data?.message || e?.message || 'Failed to send';
      toast({ title: 'Failed to send', description: msg, status: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleSendWeb = async () => {
    const to = (toPhone || selectedParent?.whatsappPhone || '').trim();
    if (!to || !message.trim()) {
      toast({ title: 'Parent phone and message are required', status: 'warning' });
      return;
    }
    try {
      setLoading(true);
      await http.post('/communication/whatsapp-web/send', { to, text: message });
      toast({ title: 'Sent via local WhatsApp', description: 'If WhatsApp Web opens, ensure it is logged in.', status: 'success' });
      setMessage('');
    } catch (e) {
      const msg = e?.response?.data?.message || e?.message || 'Failed to send via WhatsApp Web';
      toast({ title: 'Error', description: msg, status: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box pt={{ base: '130px', md: '80px', xl: '80px' }}>
      <HStack justify="space-between" mb={4}>
        <Heading size="lg">Inform Parent</Heading>
        <Button
          leftIcon={<MdArrowBack />}
          variant="ghost"
          onClick={() => navigate('/admin/parents/list')}
        >
          Back to List
        </Button>
      </HStack>
      <Card>
        <CardBody>
          <Flex direction="column" gap={4}>
            <Select placeholder="Select parent" value={parentId} onChange={(e) => onParentChange(e.target.value)}>
              {(parents || []).map((p) => (
                <option key={p.id} value={p.id}>{p.primaryName || p.fatherName || p.motherName || p.familyNumber}</option>
              ))}
            </Select>
            <Select placeholder="Select child (optional)" value={childId} onChange={(e) => onChildChange(e.target.value)}>
              {(children || []).map((c) => (
                <option key={c.id} value={c.id}>{c.name} — {c.class}-{c.section}</option>
              ))}
            </Select>
            <Select value={channel} onChange={(e) => setChannel(e.target.value)}>
              <option value="whatsapp">WhatsApp (Twilio)</option>
              <option value="sms">SMS (Twilio)</option>
              <option value="whatsapp-web">WhatsApp Web (Local)</option>
            </Select>
            <InputGroup>
              <InputLeftAddon children="Parent Number" />
              <Input placeholder="+92300XXXXXXX" value={toPhone} onChange={(e)=>setToPhone(e.target.value)} readOnly />
            </InputGroup>
            {historyEnabled && (
            <Box borderWidth="1px" borderRadius="md" p={4} maxH="360px" overflowY="auto" bg="gray.50">
              <VStack align="stretch" spacing={3}>
                {messages.map((m) => {
                  const isOutbound = m.direction === 'outbound';
                  return (
                    <Flex key={m.id} justify={isOutbound ? 'flex-end' : 'flex-start'}>
                      {!isOutbound && <Avatar name={selectedParent?.primaryName || 'P'} size="sm" mr={2} />}
                      <Box
                        maxW="70%"
                        bg={isOutbound ? 'blue.500' : 'white'}
                        color={isOutbound ? 'white' : 'gray.800'}
                        borderRadius="lg"
                        px={4}
                        py={2}
                        boxShadow="sm"
                      >
                        <Text fontSize="sm" whiteSpace="pre-wrap">{m.body}</Text>
                        <Text fontSize="xs" opacity={0.7} mt={1}>
                          {new Date(m.createdAt).toLocaleString()} • {m.channel || 'whatsapp'}
                        </Text>
                      </Box>
                    </Flex>
                  );
                })}
                {!messages.length && (
                  <Text fontSize="sm" color="gray.500" textAlign="center">No messages yet. Start the conversation below.</Text>
                )}
              </VStack>
            </Box>
            )}
            <Textarea placeholder="Type your message" value={message} onChange={(e) => setMessage(e.target.value)} rows={3} />
            <HStack>
              <Button colorScheme="blue" onClick={handleSend} isLoading={loading}>
                Send Message
              </Button>
            </HStack>
          </Flex>
        </CardBody>
      </Card>
    </Box>
  );
}
