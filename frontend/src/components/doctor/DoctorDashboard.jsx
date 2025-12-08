"use client";
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { UserPlus, Stethoscope, Activity, AlertTriangle } from 'lucide-react';

import PatientListItem from '@/components/doctor/PatientListItem';
import PatientSearchBar from '@/components/doctor/PatientSearchBar';
import RequestAccessModal from '@/components/doctor/RequestAccessModal';
import AddRecordForm from '@/components/doctor/AddRecordForm';
import EmergencyAccessForm from '@/components/doctor/EmergencyAccessForm';

const DoctorDashboard = () => {
    const [searchQuery, setSearchQuery] = useState('');
    const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);

    // Mock Data
    const [patients] = useState([
        { id: 1, name: 'Alice Johnson', initials: 'AJ', address: '0x71C...9A2', lastVisit: '2 days ago', verified: true },
        { id: 2, name: 'Robert Smith', initials: 'RS', address: '0x3B9...1F4', lastVisit: '1 week ago', verified: true },
        { id: 3, name: 'Maria Garcia', initials: 'MG', address: '0x8K2...5L9', lastVisit: '1 month ago', verified: false },
        { id: 4, name: 'David Chen', initials: 'DC', address: '0x1D4...8P3', lastVisit: '2 months ago', verified: true },
    ]);

    const filteredPatients = patients.filter(p =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.address.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const handleViewRecords = (id) => {
        toast({
            title: "Accessing Records",
            description: "Decrypting patient data from blockchain...",
            className: "bg-blue-50 border-blue-200 text-blue-800",
        });
    };

    const handleRequestAccess = (data) => {
        toast({
            title: "Request Sent",
            description: `Access request sent to ${data.address}`,
            className: "bg-green-50 border-green-200 text-green-800",
        });
    };

    const handleAddRecord = (data) => {
        toast({
            title: "Record Created",
            description: "Medical record successfully encrypted and stored on-chain.",
            className: "bg-green-50 border-green-200 text-green-800",
        });
    };

    const handleEmergencyAccess = () => {
        toast({
            title: "EMERGENCY ACCESS GRANTED",
            description: "Access logged. Audit trail created. Proceed with caution.",
            variant: "destructive",
            duration: 6000,
        });
    };

    return (
        <div className="max-w-6xl mx-auto px-4 py-2">
            <div className="mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
                        <Stethoscope className="w-8 h-8 text-blue-600" />
                        Doctor Portal
                    </h1>
                    <p className="text-slate-500 mt-1">Manage patients and issue medical records securely.</p>
                </div>
                <div className="flex items-center gap-2 text-sm bg-blue-50 text-blue-700 px-3 py-1 rounded-full border border-blue-100">
                    <Activity className="w-4 h-4" />
                    <span className="font-medium">Node Status: Active</span>
                </div>
            </div>

            <Tabs defaultValue="patients" className="space-y-6">
                <TabsList className="bg-white border border-slate-200 p-1 rounded-xl w-full sm:w-auto grid grid-cols-3 sm:flex h-auto mb-6 shadow-sm">
                    <TabsTrigger value="patients" className="rounded-lg px-6 py-3 data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700 transition-all">
                        My Patients
                    </TabsTrigger>
                    <TabsTrigger value="add-record" className="rounded-lg px-6 py-3 data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700 transition-all">
                        Add Record
                    </TabsTrigger>
                    <TabsTrigger value="emergency" className="rounded-lg px-6 py-3 data-[state=active]:bg-red-50 data-[state=active]:text-red-600 transition-all">
                        Emergency
                    </TabsTrigger>
                </TabsList>

                <AnimatePresence mode="wait">
                    <TabsContent value="patients" className="outline-none">
                        <motion.div
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            transition={{ duration: 0.3 }}
                        >
                            <div className="flex justify-between items-center mb-4">
                                <h2 className="text-xl font-semibold text-slate-900">Patient List</h2>
                                <Button onClick={() => setIsRequestModalOpen(true)} className="bg-blue-600 hover:bg-blue-700 text-white gap-2">
                                    <UserPlus className="w-4 h-4" />
                                    Request Access
                                </Button>
                            </div>

                            <PatientSearchBar
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />

                            <div className="space-y-2">
                                <AnimatePresence>
                                    {filteredPatients.map((patient) => (
                                        <PatientListItem
                                            key={patient.id}
                                            patient={patient}
                                            onViewRecords={handleViewRecords}
                                        />
                                    ))}
                                </AnimatePresence>
                                {filteredPatients.length === 0 && (
                                    <motion.div
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        className="text-center py-16 bg-slate-50 rounded-xl border border-dashed border-slate-200"
                                    >
                                        <p className="text-slate-500">No patients found matching your search.</p>
                                    </motion.div>
                                )}
                            </div>
                        </motion.div>
                    </TabsContent>

                    <TabsContent value="add-record" className="outline-none">
                        <AddRecordForm onSubmit={handleAddRecord} />
                    </TabsContent>

                    <TabsContent value="emergency" className="outline-none">
                        <EmergencyAccessForm onSubmit={handleEmergencyAccess} />
                    </TabsContent>
                </AnimatePresence>
            </Tabs>

            <RequestAccessModal
                open={isRequestModalOpen}
                onOpenChange={setIsRequestModalOpen}
                onSubmit={handleRequestAccess}
            />
        </div>
    );
};

export default DoctorDashboard;
