const MeetingHistory = require('../../model/schema/meeting')
const mongoose = require('mongoose');
const logger = require('pino')();
const User = require('../../model/schema/user');

const add = async (req, res) => {
  try {
    const {agenda, location, related, dateTime, notes, createBy, attendes, attendesLead} = req.body;
    if (attendes && attendes.length >0) {
      attendes.forEach((attendy, index) => {
        if (!mongoose.Types.ObjectId.isValid(attendy)) {
          res.status(400).json({ error: 'Invalid attendy value' + attendy });
        }
      });
    }
    if (attendesLead && attendesLead.length >0) {
      attendesLead.forEach((attendyLead, index) => {
        if (!mongoose.Types.ObjectId.isValid(attendyLead)) {
          res.status(400).json({ error: 'Invalid attendy value' + attendyLead });
        }
      });
    }
    const meetingData = { agenda, location, related, dateTime, notes, createBy, timestamp: new Date(), deleted: false };
    if (attendes && attendes.length > 0) {
      meetingData.attendes = attendes;
    }
    if (attendesLead && attendesLead.length > 0) {
      meetingData.attendesLead = attendesLead;
    }

    const result = new MeetingHistory(meetingData);
    await result.save();
    res.status(200).json(result);
  } catch (err) {
    console.error('Failed to create meeting:', err);
    res.status(400).json({ error: 'Failed to create meeting : ', err });
  }
}

const index = async (req, res) => {
  try {
    const query = req.query;
    query.deleted = false;
    const user = await User.findById(req.user.userId);
    if (user?.role !== "superAdmin") {
      delete query.createBy
      query.$or = [{ createBy: new mongoose.Types.ObjectId(req.user.userId) }, { attendes: { $elemMatch : new mongoose.Types.ObjectId(req.user.userId) } }, { attendesLead: { $elemMatch : new mongoose.Types.ObjectId(req.user.userId) } }];
    }
    const result = await MeetingHistory.aggregate([
      { $match: query },
      {
        $lookup: {
            from: 'User',
            localField: 'createBy',
            foreignField: '_id',
            as: 'users'
        }
      },
      {
        $lookup: {
            from: 'Contact',
            localField: 'attendes',
            foreignField: '_id',
            as: 'contact'
        }
      },
      {
        $lookup: {
            from: 'Leads',
            localField: 'attendesLead',
            foreignField: '_id',
            as: 'attendesLead'
        }
      },
      { $unwind: { path: '$users', preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          createdByName: '$users.username',
        }
      },
    ]);
    logger.info(result);
    res.status(200).json(result);
  } catch (err) {
    logger.error(err);
    console.error('Failed :', err);
    res.status(400).json({ err, error: 'Failed ' });
  }
}

const view = async (req, res) => {
  try {
    let response = await MeetingHistory.findOne({ _id: req.params.id });
    if (!response) return res.status(404).json({ message: "no Data Found." });

    let result = await MeetingHistory.aggregate([
      { $match: { _id: response._id } },
      {
        $lookup: {
            from: 'User',
            localField: 'createBy',
            foreignField: '_id',
            as: 'createBy'
        }
      },
      {
        $lookup: {
            from: 'Contacts',
            localField: 'attendes',
            foreignField: '_id',
            as: 'attendes'
        }
      },
      {
        $lookup: {
            from: 'Leads',
            localField: 'attendesLead',
            foreignField: '_id',
            as: 'attendesLead'
        }
      },
      { $unwind: { path: '$createBy', preserveNullAndEmptyArrays: true } },
      { $project: 
        { 
          agenda: 1,
          location: 1,
          createdByName: 1,
          related: 1,
          timestamp: 1,
          dateTime: 1,
          notes: 1,
          createBy: 1, 
          attendes: {
              $cond: {
                if: { $eq: [{ $size: '$attendes' }, 0] }, // Check if the array is empty
                then: [], // Return an empty array
                else: {
                  $map: {
                    input: '$attendes',
                    as: 'at',
                    in: {
                      _id: '$$at._id',
                      fullName: '$$at.fullName',
                      email: '$$at.email',
                      phoneNumber: '$$at.phoneNumber',
                      firstName: {
                        $arrayElemAt: [{ $split: ['$$at.fullName', ' '] }, 0], // First part of fullName
                      },
                      lastName: {
                        $arrayElemAt: [{ $split: ['$$at.fullName', ' '] }, 1],
                      },
                    },
                  },
                },
              },
            },
            attendesLead: {
                $cond: {
                  if: { $eq: [{ $size: '$attendesLead' }, 0] }, // Check if the array is empty
                  then: [], // Return an empty array
                  else: {
                    $map: {
                      input: '$attendesLead',
                      as: 'al',
                      in: {
                        _id: '$$al._id',
                        leadName: '$$al.leadName',
                        leadEmail: '$$al.leadEmail',
                      },
                    },
                  },
                },
              },
          },
       }
    ]);

    res.status(200).json(result[0]);
  } catch (err) {
    console.log('Error:', err);
    res.status(400).json({ Error: err });
  }
}

const deleteData = async (req, res) => {
  try {
    const result = await MeetingHistory.findByIdAndUpdate(req.params.id, { deleted: true });
    res.status(200).json({ message: "done", result })
  } catch (err) {
    res.status(404).json({ message: "error", err })
  }
}

const deleteMany = async (req, res) => {
  try {
    const result = await MeetingHistory.updateMany({ _id: { $in: req.body } }, { $set: { deleted: true } });
    if (result?.matchedCount > 0 && result?.modifiedCount > 0) {
      return res.status(200).json({ message: "Meetings Removed successfully", result });
    }
    else {
      return res.status(404).json({ success: false, message: "Failed to remove Meetings" })
    }
  } catch (err) {
    return res.status(404).json({ success: false, message: "error", err });
  }
}

module.exports = { add, index, view, deleteData, deleteMany }