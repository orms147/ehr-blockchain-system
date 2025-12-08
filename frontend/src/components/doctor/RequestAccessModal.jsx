"use client";
import React, { useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { UserPlus, Loader2 } from 'lucide-react';

const RequestAccessModal = ({ open, onOpenChange, onSubmit }) => {
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({ address: '', reason: '' });

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        // Simulate API call
        await new Promise(resolve => setTimeout(resolve, 1000));
        onSubmit(formData);
        setLoading(false);
        setFormData({ address: '', reason: '' });
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <UserPlus className="w-5 h-5 text-blue-600" />
                        Request Patient Access
                    </DialogTitle>
                    <DialogDescription>
                        Send a request to a patient to view their medical records. They must approve this request.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="patient-address">Patient Wallet Address</Label>
                        <Input
                            id="patient-address"
                            placeholder="0x..."
                            value={formData.address}
                            onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                            required
                            className="font-mono"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="reason">Reason for Access</Label>
                        <Textarea
                            id="reason"
                            placeholder="e.g. Scheduled consultation, New patient intake..."
                            value={formData.reason}
                            onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                            required
                        />
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={loading} className="bg-blue-600 hover:bg-blue-700">
                            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Send Request
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
};

export default RequestAccessModal;
