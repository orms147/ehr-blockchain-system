"use client";

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Share2 } from 'lucide-react';

const GrantAccessForm = ({ onGrant }) => {
    const [address, setAddress] = useState('');
    const [duration, setDuration] = useState('1_week');
    const [loading, setLoading] = useState(false);

    const handleSubmit = (e) => {
        e.preventDefault();
        setLoading(true);

        // Simulate network request
        setTimeout(() => {
            onGrant({ address, duration });
            setAddress('');
            setDuration('1_week');
            setLoading(false);
        }, 1000);
    };

    return (
        <Card className="border-slate-200 bg-slate-50/50">
            <CardHeader className="pb-3">
                <CardTitle className="text-lg font-semibold flex items-center gap-2">
                    <Share2 className="w-5 h-5 text-blue-600" />
                    Grant New Access
                </CardTitle>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="address">Doctor's Wallet Address</Label>
                        <Input
                            id="address"
                            placeholder="0x..."
                            value={address}
                            onChange={(e) => setAddress(e.target.value)}
                            required
                            className="bg-white font-mono text-sm"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="duration">Access Duration</Label>
                        <div className="relative">
                            <select
                                id="duration"
                                value={duration}
                                onChange={(e) => setDuration(e.target.value)}
                                className="flex h-10 w-full items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-950 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 appearance-none"
                            >
                                <option value="1_day">1 Day</option>
                                <option value="1_week">1 Week</option>
                                <option value="1_month">1 Month</option>
                                <option value="forever">Forever</option>
                            </select>
                            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-500">
                                <svg className="h-4 w-4 fill-current" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                                    <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
                                </svg>
                            </div>
                        </div>
                    </div>

                    <Button
                        type="submit"
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                        disabled={loading}
                    >
                        {loading ? 'Processing...' : 'Grant Access'}
                    </Button>
                </form>
            </CardContent>
        </Card>
    );
};

export default GrantAccessForm;
