import React, { useState, useEffect } from 'react';
import {
    Box, Flex, Button, useToast, Table, Thead, Tbody, Tr, Th, Td, Text, Heading, useColorModeValue,
    Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalCloseButton, ModalFooter,
    FormControl, FormLabel, Input, Select, useDisclosure, Textarea
} from '@chakra-ui/react';
import { MdAdd, MdEmojiEvents, MdEdit, MdDelete } from 'react-icons/md';
import Card from '../../../../../components/card/Card';
import { awardApi, hrEmployeesApi } from '../../../../../services/moduleApis';
import * as campusesApi from '../../../../../services/api/campuses';
import { useAuth } from '../../../../../contexts/AuthContext';

export default function AwardsList() {
    const { campusId } = useAuth();
    const toast = useToast();
    const { isOpen, onOpen, onClose } = useDisclosure();
    const [awards, setAwards] = useState([]);
    const [loading, setLoading] = useState(true);
    const [employees, setEmployees] = useState([]);
    const [campuses, setCampuses] = useState([]);
    const [editingAward, setEditingAward] = useState(null);
    const [formData, setFormData] = useState({
        awardName: '',
        giftItem: '',
        cashPrice: '',
        employeeName: '',
        employeeId: '',
        employeeCampusId: '',
        selectedCampusId: '',
        reason: ''
    });

    const textColor = useColorModeValue('secondaryGray.900', 'white');

    useEffect(() => { fetchAwards(); }, [campusId]);

    useEffect(() => {
        const run = async () => {
            try {
                const rows = await hrEmployeesApi.list({ campusId });
                setEmployees(Array.isArray(rows) ? rows : []);
            } catch (e) {
                setEmployees([]);
            }
        };
        run();
    }, [campusId]);

    useEffect(() => {
        const loadCampuses = async () => {
            try {
                const res = await campusesApi.getAll();
                setCampuses(Array.isArray(res) ? res : res?.data || []);
            } catch (e) {
                setCampuses([]);
            }
        };
        loadCampuses();
    }, []);

    const fetchAwards = async () => {
        setLoading(true);
        try {
            const data = await awardApi.list({ campusId });
            setAwards(Array.isArray(data) ? data : []);
        } catch (e) { 
            console.error(e);
            setAwards([]);
        }
        finally { setLoading(false); }
    };

    const handleSubmit = async () => {
        try {
            if (!formData.employeeId) {
                toast({ title: 'Please select an employee', status: 'warning' });
                return;
            }
            // Determine campusId: use global campusId if set, otherwise use selected campus from dropdown
            let awardCampusId = campusId;
            if (!awardCampusId) {
                // All Campuses mode
                if (editingAward) {
                    // When editing, use the award's existing campusId
                    awardCampusId = editingAward.campusId;
                } else {
                    // When creating, must select a campus from dropdown
                    awardCampusId = formData.selectedCampusId || formData.employeeCampusId;
                }
            }
            // Convert to number
            awardCampusId = Number(awardCampusId);
            if (!awardCampusId || isNaN(awardCampusId)) {
                toast({ title: 'Please select a campus for this award', status: 'warning' });
                return;
            }
            
            if (editingAward) {
                // Update existing award
                await awardApi.update(editingAward.id, { ...formData, campusId: awardCampusId, employeeId: Number(formData.employeeId) });
                toast({ title: 'Award updated', status: 'success' });
            } else {
                // Create new award
                await awardApi.create({ ...formData, campusId: awardCampusId, employeeId: Number(formData.employeeId) });
                toast({ title: 'Award Given', status: 'success' });
            }
            
            onClose();
            setEditingAward(null);
            setFormData({
                awardName: '', giftItem: '', cashPrice: '', employeeName: '',
                employeeId: '', employeeCampusId: '', selectedCampusId: '', reason: ''
            });
            fetchAwards();
        } catch (e) { 
            console.error(e);
            toast({ title: editingAward ? 'Error updating award' : 'Error giving award', status: 'error' }); 
        }
    };

    const handleEdit = (award) => {
        setEditingAward(award);
        setFormData({
            awardName: award.awardName || '',
            giftItem: award.giftItem || '',
            cashPrice: award.cashPrice || '',
            employeeName: award.employeeName || '',
            employeeId: award.employeeId || '',
            employeeCampusId: award.campusId || '',
            selectedCampusId: award.campusId || '',
            reason: award.reason || ''
        });
        onOpen();
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure you want to delete this award?')) return;
        try {
            await awardApi.delete(id);
            toast({ title: 'Award deleted', status: 'success' });
            fetchAwards();
        } catch (e) {
            toast({ title: 'Error deleting award', status: 'error' });
        }
    };

    return (
        <Box pt={{ base: '130px', md: '80px', xl: '80px' }}>
            <Flex justify='space-between' align='center' mb='20px'>
                <Heading color={textColor} fontSize='2xl'>Awards & Recognition</Heading>
                <Button leftIcon={<MdAdd />} variant='brand' onClick={onOpen}>Give Award</Button>
            </Flex>

            <Card p='20px'>
                <Table variant='simple'>
                    <Thead><Tr><Th>Award Name</Th><Th>Employee</Th><Th>Gift/Cash</Th><Th>Date</Th><Th>Reason</Th><Th>Actions</Th></Tr></Thead>
                    <Tbody>
                        {loading ? <Tr><Td colSpan={6}>Loading...</Td></Tr> : awards.map(a => (
                            <Tr key={a.id}>
                                <Td fontWeight='bold'><Flex align='center' gap={2}><MdEmojiEvents color='gold' /> {a.awardName}</Flex></Td>
                                <Td>{a.employeeName}</Td>
                                <Td>{a.giftItem} {a.cashPrice ? `($${a.cashPrice})` : ''}</Td>
                                <Td>{new Date(a.givenDate).toLocaleDateString()}</Td>
                                <Td>{a.reason}</Td>
                                <Td>
                                    <Flex gap={2}>
                                        <Button size='sm' leftIcon={<MdEdit />} onClick={() => handleEdit(a)}>Edit</Button>
                                        <Button size='sm' colorScheme='red' leftIcon={<MdDelete />} onClick={() => handleDelete(a.id)}>Delete</Button>
                                    </Flex>
                                </Td>
                            </Tr>
                        ))}
                    </Tbody>
                </Table>
            </Card>

            <Modal isOpen={isOpen} onClose={onClose}>
                <ModalOverlay />
                <ModalContent>
                    <ModalHeader>{editingAward ? 'Edit Award' : 'Give New Award'}</ModalHeader>
                    <ModalCloseButton />
                    <ModalBody>
                        <FormControl mb={3}>
                            <FormLabel>Award Title</FormLabel>
                            <Input value={formData.awardName} onChange={e => setFormData({ ...formData, awardName: e.target.value })} placeholder='e.g. Employee of the Month' />
                        </FormControl>
                        <FormControl mb={3}>
                            <FormLabel>Employee Name</FormLabel>
                            <Select
                                placeholder="Select Employee"
                                value={formData.employeeId || ''}
                                onChange={(e) => {
                                    const id = e.target.value;
                                    const emp = employees.find((x) => String(x.id) === String(id));
                                    setFormData((p) => ({
                                        ...p,
                                        employeeId: id,
                                        employeeName: emp?.name || '',
                                        employeeCampusId: emp?.campusId || emp?.campus_id || '',
                                    }));
                                }}
                            >
                                {employees.map((emp) => (
                                    <option key={emp.id} value={emp.id}>
                                        {emp.name}{emp.designation ? ` (${emp.designation})` : ''}
                                    </option>
                                ))}
                            </Select>
                        </FormControl>
                        {!campusId && (
                            <FormControl mb={3} isRequired>
                                <FormLabel>Select Campus for Award</FormLabel>
                                <Select
                                    placeholder="Select Campus"
                                    value={formData.selectedCampusId || ''}
                                    onChange={(e) => setFormData({ ...formData, selectedCampusId: e.target.value })}
                                >
                                    {campuses.map((camp) => (
                                        <option key={camp.id} value={camp.id}>
                                            {camp.name || camp.campusName || camp.title}
                                        </option>
                                    ))}
                                </Select>
                            </FormControl>
                        )}
                        <FormControl mb={3}>
                            <FormLabel>Gift Item</FormLabel>
                            <Input value={formData.giftItem} onChange={e => setFormData({ ...formData, giftItem: e.target.value })} />
                        </FormControl>
                        <FormControl mb={3}>
                            <FormLabel>Cash Prize</FormLabel>
                            <Input type='number' value={formData.cashPrice} onChange={e => setFormData({ ...formData, cashPrice: e.target.value })} />
                        </FormControl>
                        <FormControl mb={3}>
                            <FormLabel>Reason</FormLabel>
                            <Textarea value={formData.reason} onChange={e => setFormData({ ...formData, reason: e.target.value })} />
                        </FormControl>
                    </ModalBody>
                    <ModalFooter>
                        <Button colorScheme='blue' onClick={handleSubmit}>Save Award</Button>
                    </ModalFooter>
                </ModalContent>
            </Modal>
        </Box>
    );
}
