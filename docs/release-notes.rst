Release 3.2.0
=============

This documentation describes firmware 3.2.0 and the matching Studio packages.
Download binaries, the Python wheel, and the browser dashboard from the
`3.2.0 release <https://github.com/motionlayer/Tinymovr/releases/tag/3.2.0>`_.
The public repository's firmware and Studio source remains frozen at 3.0.0;
GitHub's automatically generated source archives and public compare links do
not describe the current private implementation.

Compatibility
-------------

Use Studio Python 3.2.0 or the Studio Web asset distributed with release 3.2.0.
The firmware protocol hash is ``957896750`` and differs from 3.0.0. A client
without this protocol definition cannot connect. The :ref:`api-reference` is
generated from the matching protocol definition (the 3.1.x schema is also used
by firmware 3.2.0).

Changes since the frozen public source
--------------------------------------

* External SPI sensor selection supports MPS MA600.
* :ref:`differential-positioning` adds geared dual-encoder calibration and
  absolute origin recovery within one output-shaft turn.
* X5.1 adds an onboard geared second encoder and defaults to differential mode.
* A separate position encoder skips rotor-based eccentricity compensation by
  default; the commutation magnetic encoder still receives compensation.
* :doc:`studio/web` adds a trajectory planner, connection guidance for Linux,
  and anonymous usage analytics. The calibration banner is dismissed when a
  closed-loop control state is selected; this is not confirmation of calibration.

Upgrading
---------

See :doc:`upgrade/upgrade`. Use the board-specific ``-upgrade.bin`` for CAN DFU.
The ``-release.bin`` image includes the bootloader and is intended for full
programming via a debug probe. M5.1 and M5.2 use ``M51`` assets; X5.1 uses ``X51``.
Firmware changes invalidate saved configuration except the separately preserved
CAN node ID. Restore appropriate settings and recalibrate before operation.
