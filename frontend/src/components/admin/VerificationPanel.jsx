import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Filter, ShieldCheck } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';

import VerificationItem from './VerificationItem';

const VerificationPanel = () => {
    const { toast } = useToast();
    const [searchQuery, setSearchQuery] = useState('');
    const [confirmAction, setConfirmAction] = useState({ open: false, type: null, item: null });

    const [pendingItems, setPendingItems] = useState([
        { id: 1, name: 'Dr. Eleanor Rigby', address: '0x71C...9A2', type: 'Doctor', date: '2024-10-24' },
        { id: 2, name: 'Metro General Hospital', address: '0x3B9...1F4', type: 'Organization', date: '2024-10-23' },
        { id: 3, name: 'Dr. John Watson', address: '0x8K2...5L9', type: 'Doctor', date: '2024-10-22' },
        { id: 4, name: 'City Health Clinic', address: '0x1D4...8P3', type: 'Organization', date: '2024-10-20' },
    ]);

    const filteredItems = pendingItems.filter(item =>
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.address.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const initiateAction = (item, type) => {
        setConfirmAction({ open: true, type, item });
    };

    const handleConfirm = () => {
        const { type, item } = confirmAction;

        // Remove item from list
        setPendingItems(prev => prev.filter(i => i.id !== item.id));

        // Show toast
        if (type === 'verify') {
            toast({
                title: "Entity Verified",
                description: `${item.name} has been successfully verified and added to the network.`,
                className: "bg-green-50 border-green-200 text-green-800",
            });
        } else {
            toast({
                title: "Request Rejected",
                description: `Verification request for ${item.name} has been rejected.`,
                variant: "destructive",
            });
        }

        setConfirmAction({ open: false, type: null, item: null });
    };

    return (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <div>
                    <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                        <ShieldCheck className="w-6 h-6 text-blue-600" />
                        Verification Requests
                    </h2>
                    <p className="text-sm text-slate-500">Review and approve network participants.</p>
                </div>

                <div className="relative w-full md:w-72">
                    <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                        <Search className="h-4 w-4 text-slate-400" />
                    </div>
                    <Input
                        placeholder="Search by name or address..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10"
                    />
                </div>
            </div>

            <div className="space-y-3 min-h-[300px]">
                <AnimatePresence mode="popLayout">
                    {filteredItems.map(item => (
                        <VerificationItem
                            key={item.id}
                            item={item}
                            onAction={initiateAction}
                        />
                    ))}
                </AnimatePresence>

                {filteredItems.length === 0 && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex flex-col items-center justify-center h-48 text-slate-400 border-2 border-dashed border-slate-100 rounded-xl"
                    >
                        <Filter className="w-8 h-8 mb-2 opacity-50" />
                        <p>No pending verifications found</p>
                    </motion.div>
                )}
            </div>

            <AlertDialog open={confirmAction.open} onOpenChange={(open) => !open && setConfirmAction({ ...confirmAction, open: false })}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {confirmAction.type === 'verify' ? 'Verify this entity?' : 'Reject request?'}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {confirmAction.type === 'verify'
                                ? `Are you sure you want to verify ${confirmAction.item?.name}? This will grant them write access to the blockchain network.`
                                : `Are you sure you want to reject ${confirmAction.item?.name}? This action cannot be undone.`}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleConfirm}
                            className={confirmAction.type === 'verify' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}
                        >
                            {confirmAction.type === 'verify' ? 'Confirm Verify' : 'Confirm Reject'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
};

export default VerificationPanel;
