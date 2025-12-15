import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { Plus } from 'lucide-react';

import RecordCard from '@/components/dashboard/RecordCard';
import AccessListItem from '@/components/dashboard/AccessListItem';
import RequestItem from '@/components/dashboard/RequestItem';
import GrantAccessForm from '@/components/dashboard/GrantAccessForm';
import RecordModal from '@/components/dashboard/RecordModal';

const PatientDashboard = () => {
    const [selectedRecord, setSelectedRecord] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    // Mock Data
    const [records] = useState([
        { id: 1, type: 'Diagnosis', title: 'Seasonal Allergic Rhinitis', date: 'Oct 24, 2024', doctor: 'Dr. Sarah Wilson', verified: true, details: 'Patient presents with sneezing, congestion, and itchy eyes. Prescribed antihistamines.' },
        { id: 2, type: 'Prescription', title: 'Amoxicillin 500mg', date: 'Oct 20, 2024', doctor: 'Dr. James Chen', verified: true, details: 'Take 1 capsule 3 times daily for 7 days for bacterial infection.' },
        { id: 3, type: 'Lab', title: 'Complete Blood Count (CBC)', date: 'Sep 15, 2024', doctor: 'LabCorp Central', verified: true, details: 'All levels within normal range. Hemoglobin: 14.2 g/dL.' },
        { id: 4, type: 'X-Ray', title: 'Chest X-Ray PA/Lat', date: 'Aug 10, 2024', doctor: 'Dr. Emily Hart', verified: true, details: 'Clear lung fields. No acute cardiopulmonary abnormalities.' },
        { id: 5, type: 'Checkup', title: 'Annual Physical', date: 'Jun 05, 2024', doctor: 'Dr. Sarah Wilson', verified: false, details: 'Routine annual examination. BP 120/80, HR 72. Patient is in good health.' },
    ]);

    const [accessList, setAccessList] = useState([
        { id: 1, doctorName: 'Dr. Sarah Wilson', accessScope: 'Full Access', expiryDate: 'Dec 31, 2024' },
        { id: 2, doctorName: 'Dr. James Chen', accessScope: 'Read Only', expiryDate: 'Nov 15, 2024' },
    ]);

    const [requests, setRequests] = useState([
        { id: 1, requesterName: 'Dr. Michael Ross', requesterRole: 'Cardiologist', reason: 'Upcoming consultation regarding arrhythmia.' },
        { id: 2, requesterName: 'City General Hospital', requesterRole: 'Emergency Dept', reason: 'Emergency admission access required.' },
    ]);

    // Handlers
    const handleViewDetails = (record) => {
        setSelectedRecord(record);
        setIsModalOpen(true);
    };

    const handleRevoke = (id) => {
        setAccessList(prev => prev.filter(item => item.id !== id));
        toast({
            title: "Access Revoked",
            description: "The doctor's access has been successfully revoked.",
            variant: "destructive",
        });
    };

    const handleGrantAccess = (data) => {
        toast({
            title: "Access Granted",
            description: `Access granted to ${data.address.substring(0, 6)}... for ${data.duration.replace('_', ' ')}.`,
            className: "bg-green-50 border-green-200 text-green-800",
        });
        // In a real app, we would add this to the list
    };

    const handleApproveRequest = (id) => {
        setRequests(prev => prev.filter(req => req.id !== id));
        toast({
            title: "Request Approved",
            description: "Access has been granted to the requester.",
            className: "bg-green-50 border-green-200 text-green-800",
        });
    };

    const handleRejectRequest = (id) => {
        setRequests(prev => prev.filter(req => req.id !== id));
        toast({
            title: "Request Rejected",
            description: "The access request has been denied.",
            variant: "destructive",
        });
    };

    return (
        <div className="max-w-6xl mx-auto">
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-slate-900">My Health Portal</h1>
                <p className="text-slate-500 mt-2">Manage your medical records and access permissions securely.</p>
            </div>

            <Tabs defaultValue="records" className="space-y-6">
                <TabsList className="bg-white border border-slate-200 p-1 rounded-xl w-full sm:w-auto grid grid-cols-3 sm:flex h-auto">
                    <TabsTrigger value="records" className="rounded-lg px-6 py-2.5 data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700">
                        My Records
                    </TabsTrigger>
                    <TabsTrigger value="access" className="rounded-lg px-6 py-2.5 data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700">
                        Access Control
                    </TabsTrigger>
                    <TabsTrigger value="requests" className="rounded-lg px-6 py-2.5 data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700 relative">
                        Requests
                        {requests.length > 0 && (
                            <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] flex items-center justify-center rounded-full">
                                {requests.length}
                            </span>
                        )}
                    </TabsTrigger>
                </TabsList>

                {/* Tab 1: My Records */}
                <TabsContent value="records" className="outline-none">
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-xl font-semibold text-slate-900">Medical History</h2>
                        <Button className="bg-blue-600 hover:bg-blue-700 text-white gap-2">
                            <Plus className="w-4 h-4" /> Add Record
                        </Button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {records.map(record => (
                            <RecordCard
                                key={record.id}
                                record={record}
                                onViewDetails={handleViewDetails}
                            />
                        ))}
                    </div>
                </TabsContent>

                {/* Tab 2: Access Control */}
                <TabsContent value="access" className="outline-none">
                    <div className="grid lg:grid-cols-3 gap-8">
                        <div className="lg:col-span-2 space-y-6">
                            <div className="mb-4">
                                <h2 className="text-xl font-semibold text-slate-900">Active Access</h2>
                                <p className="text-slate-500 text-sm">Doctors and institutions that can view your records.</p>
                            </div>
                            <div className="space-y-4">
                                {accessList.map(access => (
                                    <AccessListItem
                                        key={access.id}
                                        access={access}
                                        onRevoke={handleRevoke}
                                    />
                                ))}
                                {accessList.length === 0 && (
                                    <div className="text-center py-12 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                                        <p className="text-slate-500">No active access permissions granted.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div>
                            <GrantAccessForm onGrant={handleGrantAccess} />
                        </div>
                    </div>
                </TabsContent>

                {/* Tab 3: Requests */}
                <TabsContent value="requests" className="outline-none">
                    <div className="max-w-2xl">
                        <div className="mb-6">
                            <h2 className="text-xl font-semibold text-slate-900">Pending Requests</h2>
                            <p className="text-slate-500 text-sm">Review requests from healthcare providers.</p>
                        </div>
                        <div className="space-y-4">
                            {requests.map(req => (
                                <RequestItem
                                    key={req.id}
                                    request={req}
                                    onApprove={handleApproveRequest}
                                    onReject={handleRejectRequest}
                                />
                            ))}
                            {requests.length === 0 && (
                                <div className="text-center py-12 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                                    <p className="text-slate-500">No pending access requests.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </TabsContent>
            </Tabs>

            <RecordModal
                record={selectedRecord}
                open={isModalOpen}
                onOpenChange={setIsModalOpen}
            />
        </div>
    );
};

export default PatientDashboard;
