import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Heading,
  Text,
  Badge,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Select,
  Button,
  HStack,
  Flex,
  Icon,
  SimpleGrid,
  useColorModeValue,
  FormControl,
  FormLabel,
  Input,
  IconButton,
  Avatar,
  Spinner,
  useToast,
  useBreakpointValue,
  Tooltip,
} from '@chakra-ui/react';
import { ChevronLeftIcon, ChevronRightIcon } from '@chakra-ui/icons';
import { MdCalendarToday, MdCheckCircle, MdCancel, MdAccessTime, MdRefresh, MdLogin, MdLogout, MdEventBusy, MdPerson } from 'react-icons/md';
import Card from 'components/card/Card.js';
import MiniStatistics from 'components/card/MiniStatistics';
import IconBox from 'components/icons/IconBox';
import StatCard from '../../../../components/card/StatCard';
import BarChart from 'components/charts/BarChart.tsx';
import DonutChart from 'components/charts/v2/DonutChart.tsx';
import * as teacherApi from '../../../../services/api/teachers';
import { useAuth } from '../../../../contexts/AuthContext';

const TeacherAttendance = () => {
  // Date state
  const today = new Date();
  const [selectedDate, setSelectedDate] = useState(
    today.toISOString().split('T')[0]
  );
  const { campusId } = useAuth();

  const [teacherRows, setTeacherRows] = useState([]);
  const [attendanceMap, setAttendanceMap] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [weeklyLoading, setWeeklyLoading] = useState(false);
  const [weeklyTrend, setWeeklyTrend] = useState([]);
  const toast = useToast();

  // Colors
  const textColor = useColorModeValue('gray.800', 'white');
  const textColorSecondary = useColorModeValue('gray.600', 'gray.400');

  const chartH = useBreakpointValue({ base: 240, md: 280, lg: 320 });

  const normalizeTime = (value) => {
    if (!value) return '';
    return String(value).slice(0, 5);
  };

  const defaultEntry = useMemo(() => ({ status: 'absent', checkInTime: '', checkOutTime: '' }), []);

  const toISODate = (d) => {
    try {
      return new Date(d).toISOString().split('T')[0];
    } catch {
      return '';
    }
  };

  const parseISODate = (iso) => {
    // Ensure local date parsing is stable
    return new Date(`${iso}T00:00:00`);
  };

  const countStatuses = (records) => {
    let present = 0;
    let absent = 0;
    let late = 0;
    (records || []).forEach((r) => {
      const s = String(r?.status || 'absent').toLowerCase();
      if (s === 'present') present += 1;
      else if (s === 'late') late += 1;
      else absent += 1;
    });
    return { present, absent, late };
  };

  const fetchAttendance = useCallback(async () => {
    if (!selectedDate) return;
    setLoading(true);
    try {
      const response = await teacherApi.getAttendance({ date: selectedDate, campusId: campusId });
      const records = Array.isArray(response?.records) ? response.records : [];
      const normalized = records
        .filter((record) => record?.teacherId)
        .map((record) => ({
          teacherId: record.teacherId,
          name: record.teacherName || 'Unknown',
          photo: record.avatar || '',
          employeeId: record.employeeId || '—',
          department: record.department || '—',
          status: String(record.status || 'absent').toLowerCase() === 'absent' && String(record?.remarks || '').toLowerCase() === 'leave'
            ? 'leave'
            : (record.status || 'absent'),
          checkInTime: normalizeTime(record.checkInTime),
          checkOutTime: normalizeTime(record.checkOutTime),
          remarks: record?.remarks || '',
        }));
      setTeacherRows(normalized);
      setAttendanceMap(() => {
        const next = {};
        normalized.forEach((record) => {
          next[record.teacherId] = {
            status: record.status || 'absent',
            checkInTime: record.checkInTime || '',
            checkOutTime: record.checkOutTime || '',
            remarks: record.remarks || '',
          };
        });
        return next;
      });
    } catch (error) {
      console.error(error);
      setTeacherRows([]);
      setAttendanceMap({});
      toast({
        title: 'Failed to load attendance',
        description: error?.message || 'Please try again later.',
        status: 'error',
        duration: 4000,
        isClosable: true,
      });
    } finally {
      setLoading(false);
    }
  }, [selectedDate, campusId, toast]);

  const fetchWeeklyAttendance = useCallback(async () => {
    if (!selectedDate) return;
    setWeeklyLoading(true);
    try {
      const base = parseISODate(selectedDate);
      // last 7 days including selectedDate
      const days = Array.from({ length: 7 }).map((_, i) => {
        const d = new Date(base);
        d.setDate(d.getDate() - (6 - i));
        return toISODate(d);
      });

      const responses = await Promise.all(
        days.map((d) => teacherApi.getAttendance({ date: d, campusId: campusId }))
      );

      const trend = responses.map((res, idx) => {
        const records = Array.isArray(res?.records) ? res.records : [];
        const c = countStatuses(records);
        return { date: days[idx], ...c, total: records.length };
      });
      setWeeklyTrend(trend);
    } catch (error) {
      console.error(error);
      setWeeklyTrend([]);
    } finally {
      setWeeklyLoading(false);
    }
  }, [selectedDate, campusId]);

  useEffect(() => {
    fetchAttendance();
  }, [fetchAttendance]);

  useEffect(() => {
    fetchWeeklyAttendance();
  }, [fetchWeeklyAttendance]);

  const handleQuickAction = (teacherId, status) => {
    const now = new Date();
    const timeStr = now.toTimeString().slice(0, 5);
    
    if (status === 'present') {
      updateAttendanceEntry(teacherId, { status: 'present', checkInTime: timeStr });
    } else if (status === 'absent') {
      updateAttendanceEntry(teacherId, { status: 'absent', checkInTime: '', checkOutTime: '' });
    } else if (status === 'late') {
      updateAttendanceEntry(teacherId, { status: 'late', checkInTime: timeStr });
    } else if (status === 'leave') {
      updateAttendanceEntry(teacherId, { status: 'leave', checkInTime: '', checkOutTime: '', remarks: 'Leave' });
    }
  };

  const handleCheckIn = (teacherId) => {
    const timeStr = new Date().toTimeString().slice(0, 5);
    updateAttendanceEntry(teacherId, { status: 'present', checkInTime: timeStr });
  };

  const handleCheckOut = (teacherId) => {
    const timeStr = new Date().toTimeString().slice(0, 5);
    updateAttendanceEntry(teacherId, { checkOutTime: timeStr });
  };

  // Handle attendance status change
  const updateAttendanceEntry = (teacherId, changes) => {
    setAttendanceMap((prev) => {
      const existing = prev[teacherId] || defaultEntry;
      return {
        ...prev,
        [teacherId]: {
          ...existing,
          ...changes,
        },
      };
    });
  };

  const handleStatusChange = (teacherId, status) => {
    updateAttendanceEntry(teacherId, { status });
  };

  const handleTimeChange = (teacherId, field, value) => {
    updateAttendanceEntry(teacherId, { [field]: value });
  };

  // Handle date change
  const handleDateChange = (e) => {
    setSelectedDate(e.target.value);
  };

  // Change date by one day
  const changeDate = (direction) => {
    const current = new Date(selectedDate);
    current.setDate(current.getDate() + direction);
    setSelectedDate(current.toISOString().split('T')[0]);
  };

  // Handle save attendance
  const handleSaveAttendance = async () => {
    if (!selectedDate || !teacherRows.length) return;
    setSaving(true);
    try {
      const entries = teacherRows.map((row) => {
        const entry = attendanceMap[row.teacherId] || defaultEntry;
        const uiStatus = String(entry.status || 'absent').toLowerCase();
        const payloadStatus = uiStatus === 'leave' ? 'absent' : (entry.status || 'absent');
        const payloadRemarks = uiStatus === 'leave' ? 'Leave' : (entry.remarks || undefined);
        const cleanedRemarks = typeof payloadRemarks === 'string' && payloadRemarks.trim().length
          ? payloadRemarks.trim()
          : undefined;
        return {
          teacherId: row.teacherId,
          status: payloadStatus,
          checkInTime: entry.checkInTime || null,
          checkOutTime: entry.checkOutTime || null,
          remarks: cleanedRemarks,
        };
      });
      await teacherApi.saveAttendance({ date: selectedDate, entries, campusId: campusId });
      toast({
        title: 'Attendance saved',
        description: formatDate(selectedDate),
        status: 'success',
        duration: 3000,
        isClosable: true,
      });
      fetchAttendance();
    } catch (error) {
      console.error(error);
      toast({
        title: 'Failed to save attendance',
        description: error?.message || 'Please try again.',
        status: 'error',
        duration: 4000,
        isClosable: true,
      });
    } finally {
      setSaving(false);
    }
  };

  // Format date for display
  const formatDate = (dateString) => {
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    return new Date(dateString).toLocaleDateString(undefined, options);
  };

  // Calculate attendance stats
  const stats = useMemo(() => {
    const total = teacherRows.length;
    const statuses = teacherRows.map((row) => (attendanceMap[row.teacherId]?.status) || 'absent');
    const present = statuses.filter((status) => status === 'present').length;
    const absent = statuses.filter((status) => status === 'absent').length;
    const late = statuses.filter((status) => status === 'late').length;
    return { total, present, absent, late };
  }, [attendanceMap, teacherRows]);

  const weeklyChart = useMemo(() => {
    const hasAny = Array.isArray(weeklyTrend) && weeklyTrend.some((d) => (d.present + d.absent + d.late) > 0);

    // If API returns empty for previous days but current day has teachers, show a usable fallback
    const base = parseISODate(selectedDate);
    const fallbackDays = Array.from({ length: 7 }).map((_, i) => {
      const d = new Date(base);
      d.setDate(d.getDate() - (6 - i));
      return toISODate(d);
    });

    const rows = hasAny
      ? weeklyTrend
      : (stats.total > 0
        ? fallbackDays.map((d) => ({ date: d, present: stats.present, absent: stats.absent, late: stats.late }))
        : []);

    const categories = (rows || []).map((x) => {
      try {
        return new Date(x.date).toLocaleDateString(undefined, { weekday: 'short' });
      } catch {
        return String(x.date);
      }
    });

    return {
      categories,
      series: [
        { name: 'Present', data: (rows || []).map((x) => Number(x.present || 0)) },
        { name: 'Absent', data: (rows || []).map((x) => Number(x.absent || 0)) },
        { name: 'Late', data: (rows || []).map((x) => Number(x.late || 0)) },
      ],
    };
  }, [selectedDate, stats.absent, stats.late, stats.present, stats.total, weeklyTrend]);

  const donut = useMemo(() => {
    const labels = ['Present', 'Absent', 'Late'];
    const series = stats.total > 0 ? [stats.present, stats.absent, stats.late] : [];
    return { labels, series };
  }, [stats.absent, stats.late, stats.present, stats.total]);

  return (
    <Box pt={{ base: '130px', md: '80px', xl: '80px' }}>
      {/* Page Header */}
      <Flex mb={5} justifyContent="space-between" alignItems="center">
        <Box>
          <Heading as="h3" size="lg" mb={1}>Teacher Attendance</Heading>
          <Text color={textColorSecondary}>Manage and track teacher attendance</Text>
        </Box>
      </Flex>

      {/* Date Selector */}
      <Card mb={5}>
        <Flex
          p={4}
          justifyContent="space-between"
          alignItems="center"
          direction={{ base: "column", md: "row" }}
          gap={4}
        >
          <FormControl maxW="300px">
            <FormLabel>Select Date</FormLabel>
            <HStack>
              <IconButton
                icon={<ChevronLeftIcon />}
                onClick={() => changeDate(-1)}
                aria-label="Previous day"
              />
              <Input
                type="date"
                value={selectedDate}
                onChange={handleDateChange}
                max={today.toISOString().split('T')[0]}
              />
              <IconButton
                icon={<ChevronRightIcon />}
                onClick={() => changeDate(1)}
                isDisabled={selectedDate === today.toISOString().split('T')[0]}
                aria-label="Next day"
              />
            </HStack>
          </FormControl>

          <Button
            colorScheme="blue"
            size="md"
            onClick={handleSaveAttendance}
            isLoading={saving}
            isDisabled={!teacherRows.length || saving}
            leftIcon={<Icon as={MdCheckCircle} />}
          >
            Save Attendance
          </Button>
        </Flex>
      </Card>

      {/* Stats Cards - redesigned */}
      <SimpleGrid columns={{ base: 1, md: 4 }} spacing={5} mb={5}>
        <StatCard
          title='Total'
          value={String(stats.total)}
          subValue={formatDate(selectedDate)}
          icon={MdCalendarToday}
          colorScheme='blue'
        />
        <StatCard
          title='Present'
          value={String(stats.present)}
          subValue={`${stats.total > 0 ? Math.round((stats.present / stats.total) * 100) : 0}%`}
          icon={MdCheckCircle}
          colorScheme='green'
        />
        <StatCard
          title='Absent'
          value={String(stats.absent)}
          subValue={`${stats.total > 0 ? Math.round((stats.absent / stats.total) * 100) : 0}%`}
          icon={MdCancel}
          colorScheme='pink'
        />
        <StatCard
          title='Late'
          value={String(stats.late)}
          subValue={`${stats.total > 0 ? Math.round((stats.late / stats.total) * 100) : 0}%`}
          icon={MdAccessTime}
          colorScheme='orange'
        />
      </SimpleGrid>

      <SimpleGrid columns={{ base: 1, lg: 3 }} spacing={5} mb={5}>
        <Card p='20px' gridColumn={{ base: 'auto', lg: 'span 2' }}>
          <Flex justify='space-between' align='center' mb='12px'>
            <Box>
              <Text fontSize='lg' fontWeight='bold'>Weekly Trend</Text>
              <Text fontSize='sm' color={textColorSecondary}>Present vs Absent vs Late</Text>
            </Box>
            <Badge colorScheme='blue'>{weeklyLoading ? 'Loading' : '7 days'}</Badge>
          </Flex>
          <BarChart
            ariaLabel='Weekly teacher attendance'
            height={chartH || 280}
            stacked
            categories={weeklyChart.categories}
            series={weeklyChart.series}
            options={{
              colors: ['#22c55e', '#60a5fa', '#f59e0b'],
              plotOptions: { bar: { borderRadius: 8, columnWidth: '55%' } },
              tooltip: { shared: true, intersect: false },
              yaxis: { min: 0 },
              responsive: [
                {
                  breakpoint: 640,
                  options: {
                    legend: { position: 'bottom' },
                    plotOptions: { bar: { columnWidth: '70%' } },
                    xaxis: { labels: { rotate: -55 } },
                  },
                },
              ],
            }}
          />
        </Card>

        <Card p='20px'>
          <Flex justify='space-between' align='center' mb='12px'>
            <Box>
              <Text fontSize='lg' fontWeight='bold'>Status Split</Text>
              <Text fontSize='sm' color={textColorSecondary}>For selected date</Text>
            </Box>
            <Badge colorScheme='purple'>Donut</Badge>
          </Flex>
          <DonutChart
            ariaLabel='Teacher attendance status donut'
            height={chartH || 280}
            labels={donut.labels}
            series={donut.series}
            options={{
              colors: ['#22c55e', '#60a5fa', '#f59e0b'],
              legend: { position: 'bottom' },
            }}
          />
        </Card>
      </SimpleGrid>

      {/* Attendance Table */}
      <Card overflow="hidden">
        <Heading size="md" p={4} borderBottomWidth={1} borderColor={useColorModeValue("gray.200", "gray.700")}>
          Attendance Record - {formatDate(selectedDate)}
        </Heading>

        <Box overflowX="auto">
          <Table variant="simple">
            <Thead bg={useColorModeValue('gray.50', 'gray.800')}>
              <Tr>
                <Th>Teacher</Th>
                <Th>ID</Th>
                <Th>Department</Th>
                <Th textAlign="center">TODAY'S STATUS</Th>
                <Th textAlign="center">CHECK-IN</Th>
                <Th textAlign="center">CHECK-OUT</Th>
                <Th textAlign="right">ACTIONS</Th>
              </Tr>
            </Thead>
            <Tbody>
              {loading ? (
                <Tr>
                  <Td colSpan={7}>
                    <Flex align="center" justify="center" py={10}>
                      <Spinner size="sm" mr={3} />
                      <Text>Loading attendance...</Text>
                    </Flex>
                  </Td>
                </Tr>
              ) : teacherRows.length === 0 ? (
                <Tr>
                  <Td colSpan={7}>
                    <Text textAlign="center" py={6} color={textColorSecondary}>
                      No teachers found for the selected date.
                    </Text>
                  </Td>
                </Tr>
              ) : (
                teacherRows.map((teacher) => {
                  const attendanceEntry = attendanceMap[teacher.teacherId] || defaultEntry;
                  const attendanceStatus = attendanceEntry.status || 'absent';
                  const isMarked = attendanceStatus !== 'absent';
                  
                  return (
                    <Tr key={teacher.teacherId}>
                      <Td>
                        <Flex align="center">
                          <Avatar src={teacher.photo} name={teacher.name} size="sm" mr={3} />
                          <Box>
                            <Text fontWeight="bold" fontSize="sm">{teacher.name}</Text>
                            <Text fontSize="xs" color="gray.500">{teacher.department}</Text>
                          </Box>
                        </Flex>
                      </Td>
                      <Td fontSize="sm">{teacher.employeeId}</Td>
                      <Td fontSize="sm">{teacher.department}</Td>
                      <Td textAlign="center">
                        <Badge 
                          variant="subtle" 
                          colorScheme={
                            attendanceStatus === 'present' ? 'green' : 
                            attendanceStatus === 'late' ? 'orange' : 
                            attendanceStatus === 'leave' ? 'purple' : 'gray'
                          }
                          px={2}
                          py={1}
                          borderRadius="md"
                          bg={
                            attendanceStatus === 'present' ? 'green.50' : 
                            attendanceStatus === 'late' ? 'orange.50' : 
                            attendanceStatus === 'leave' ? 'purple.50' : 'gray.50'
                          }
                          color={
                            attendanceStatus === 'present' ? 'green.600' : 
                            attendanceStatus === 'late' ? 'orange.600' : 
                            attendanceStatus === 'leave' ? 'purple.600' : 'gray.600'
                          }
                          fontWeight="800"
                        >
                          {attendanceStatus === 'absent' ? 'NOT MARKED' : attendanceStatus.toUpperCase()}
                        </Badge>
                      </Td>
                      <Td textAlign="center">
                        {attendanceEntry.checkInTime ? (
                          <Text fontSize="sm" fontWeight="500" color="secondaryGray.600">{attendanceEntry.checkInTime}</Text>
                        ) : (
                          <Button 
                            size="sm" 
                            bg="#01B574"
                            _hover={{ bg: "#019a62" }}
                            color="white"
                            leftIcon={<Icon as={MdAccessTime} />} 
                            onClick={() => handleCheckIn(teacher.teacherId)}
                            isDisabled={attendanceStatus === 'leave'}
                            borderRadius="12px"
                            fontSize="xs"
                          >
                            Check In
                          </Button>
                        )}
                      </Td>
                      <Td textAlign="center">
                        {attendanceEntry.checkOutTime ? (
                          <Text fontSize="sm" fontWeight="500" color="secondaryGray.600">{attendanceEntry.checkOutTime}</Text>
                        ) : (
                          <Button 
                            size="sm" 
                            bg="#4318FF"
                            _hover={{ bg: "#3311cc" }}
                            color="white"
                            leftIcon={<Icon as={MdAccessTime} />} 
                            onClick={() => handleCheckOut(teacher.teacherId)}
                            isDisabled={!attendanceEntry.checkInTime || attendanceStatus === 'leave'}
                            borderRadius="12px"
                            fontSize="xs"
                          >
                            Check Out
                          </Button>
                        )}
                      </Td>
                      <Td>
                        <HStack spacing={1} justify="flex-end">
                          <Tooltip label="Mark Present">
                            <IconButton 
                              size="sm" 
                              icon={<MdCheckCircle />} 
                              bg={attendanceStatus === 'present' ? '#01B574' : '#01B574'} 
                              color="white"
                              _hover={{ bg: "#019a62" }}
                              onClick={() => handleQuickAction(teacher.teacherId, 'present')}
                            />
                          </Tooltip>
                          <Tooltip label="Mark Absent">
                            <IconButton 
                              size="sm" 
                              icon={<MdCancel />} 
                              bg="#EE5D50"
                              color="white"
                              _hover={{ bg: "#d44b40" }}
                              onClick={() => handleQuickAction(teacher.teacherId, 'absent')}
                            />
                          </Tooltip>
                          <Tooltip label="Mark Late">
                            <IconButton 
                              size="sm" 
                              icon={<MdAccessTime />} 
                              bg="#FFB547"
                              color="white"
                              _hover={{ bg: "#e6a33f" }}
                              onClick={() => handleQuickAction(teacher.teacherId, 'late')}
                            />
                          </Tooltip>
                          <Tooltip label="Mark Leave">
                            <IconButton 
                              size="sm" 
                              icon={<MdCalendarToday />} 
                              bg="#FFB547"
                              color="white"
                              _hover={{ bg: "#e6a33f" }}
                              onClick={() => handleQuickAction(teacher.teacherId, 'leave')}
                            />
                          </Tooltip>
                          <Tooltip label="View Profile">
                            <IconButton 
                              size="sm" 
                              icon={<MdPerson />} 
                              bg="#4318FF"
                              color="white"
                              _hover={{ bg: "#3311cc" }}
                              onClick={() => {}} 
                            />
                          </Tooltip>
                        </HStack>
                      </Td>
                    </Tr>
                  );
                })
              )}
            </Tbody>
          </Table>
        </Box>
      </Card>
    </Box>
  );
};

export default TeacherAttendance;
