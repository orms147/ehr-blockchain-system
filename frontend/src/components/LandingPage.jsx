"use client";
import React from 'react';
import Navbar from '@/components/Navbar';
import HeroSection from '@/components/HeroSection';
import FeaturesSection from '@/components/FeaturesSection';
import Footer from '@/components/Footer';

const LandingPage = () => {
    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-teal-50">
            <Navbar />
            <HeroSection />
            <FeaturesSection />
            <Footer />
        </div>
    );
};

export default LandingPage;
